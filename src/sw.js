// =============================================================================
// CNR Tracker — Service Worker
// Handles: app shell caching, API response caching, offline fallback
// =============================================================================

const CACHE_VERSION = 'cnr-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE       = `${CACHE_VERSION}-api`;

// App shell — cache on install, serve from cache first
const SHELL_URLS = [
  '/',
  '/na1',
  '/na2',
  '/eu1',
  '/manifest.json',
  '/fonts/fonts.css',
];

// API patterns — cache with network-first strategy
const API_PATTERNS = [
  /\/api\/servers/,
  /\/api\/players/,
  /api\.gtacnr\.net/,
  // removed FiveM proxy/cache patterns — FiveM frontend API is not used
];

// Leaderboard patterns — cache with stale-while-revalidate (6h TTL)
const LB_PATTERNS = [
  /\/api\/leaderboard/,
  /gtacnr\.net\/api\/leaderboards/,
];

const LB_TTL = 6 * 60 * 60 * 1000; // 6 hours in ms

// =============================================================================
// Install — cache app shell
// =============================================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(cache => {
      return cache.addAll(SHELL_URLS).catch(e => {
        console.warn('[SW] shell cache failed:', e);
      });
    }).then(() => self.skipWaiting())
  );
});

// =============================================================================
// Activate — clean up old caches
// =============================================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('cnr-') && !k.startsWith(CACHE_VERSION))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// =============================================================================
// Fetch — intercept requests
// =============================================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and non-http
  if (!event.request.url.startsWith('http')) return;

  // Leaderboard — stale-while-revalidate with 6h TTL
  if (LB_PATTERNS.some(p => p.test(url.href))) {
    event.respondWith(staleWhileRevalidate(event.request, API_CACHE, LB_TTL));
    return;
  }

  // API — network first, fall back to cache
  if (API_PATTERNS.some(p => p.test(url.href))) {
    event.respondWith(networkFirstWithCache(event.request, API_CACHE, 30 * 1000));
    return;
  }

  // App shell (HTML pages) — cache first, fall back to network
  if (
    url.origin === self.location.origin &&
    (url.pathname === '/' || ['/na1','/na2','/eu1'].includes(url.pathname))
  ) {
    event.respondWith(cacheFirstWithNetwork(event.request, APP_SHELL_CACHE));
    return;
  }

  // Everything else — network only
});

// =============================================================================
// Strategies
// =============================================================================

// Network first — try network, cache on success, fall back to cache on failure
async function networkFirstWithCache(request, cacheName, ttl) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request, { signal: AbortSignal.timeout(8000) });
    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      // Tag with timestamp for TTL checking
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const taggedResponse = new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers,
      });
      cache.put(request, taggedResponse);
    }
    return networkResponse;
  } catch (e) {
    // Offline — try cache
    const cached = await cache.match(request);
    if (cached) {
      // Add header so client knows it's stale
      const headers = new Headers(cached.headers);
      headers.set('sw-from-cache', '1');
      return new Response(await cached.blob(), {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    return new Response(JSON.stringify({ error: 'offline', cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Stale-while-revalidate — serve cache immediately, update in background
async function staleWhileRevalidate(request, cacheName, ttl) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchAndCache = async () => {
    try {
      const r = await fetch(request, { signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        const headers = new Headers(r.headers);
        headers.set('sw-cached-at', Date.now().toString());
        cache.put(request, new Response(await r.clone().blob(), {
          status: r.status, statusText: r.statusText, headers,
        }));
      }
      return r;
    } catch (e) { return null; }
  };

  if (cached) {
    const cachedAt = parseInt(cached.headers.get('sw-cached-at') || '0');
    const age      = Date.now() - cachedAt;
    if (age < ttl) {
      // Fresh enough — serve cache and revalidate in background
      fetchAndCache();
      return cached;
    }
    // Stale — fetch fresh but return stale immediately while it loads
    const freshPromise = fetchAndCache();
    return cached; // return stale immediately
  }

  // No cache — must fetch
  const fresh = await fetchAndCache();
  if (fresh) return fresh;
  return new Response(JSON.stringify({ error: 'offline', cached: false }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Cache first — serve from cache, fall back to network
async function cacheFirstWithNetwork(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const r = await fetch(request);
    if (r.ok) cache.put(request, r.clone());
    return r;
  } catch (e) {
    return new Response('<h1>Offline</h1><p>CNR Tracker is unavailable offline for this page.</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

// =============================================================================
// Message handler — allow clients to send commands to the SW
// =============================================================================
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CLEAR_API_CACHE') {
    caches.delete(API_CACHE);
  }
});