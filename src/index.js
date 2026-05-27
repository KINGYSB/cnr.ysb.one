// =============================================================================
// CNR Tracker Worker
// Deployed at cnr.ysb.one  —  serves the full SPA + Discord embeds + API
// Requires KV namespace binding: CNR_CACHE
// Cron trigger: every 5 minutes (for history snapshots)
// =============================================================================

// ─── Static HTML asset ───────────────────────────────────────────────────────
// Put cnr.html in src/ and add to wrangler.toml:
//   [[rules]]
//   type = "Text"
//   globs = ["**/*.html"]
//   fallthrough = true
import cnrHtmlRaw from './cnr.html';
// Patch the HTML for cnr.ysb.one context:
//   1. Update og:url and logo tag
//   2. Inject a tiny script that converts /na1 paths → #/na1 hash so the SPA
//      routes correctly when a real browser hits a pretty URL
const CNR_HTML = cnrHtmlRaw
  .replace(
    '<meta property="og:url" content="https://ysb.one">',
    '<meta property="og:url" content="https://cnr.ysb.one">'
  )
  .replace('ysb.one/utils/cnr</div>', 'cnr.ysb.one</div>')
  .replace(
    '</head>',
    `<script>
(function(){
  var p = location.pathname.slice(1).toLowerCase();
  if (['na1','na2','eu1'].includes(p) && !location.hash) {
    history.replaceState(null, '', '/#/' + p);
  }
})();
</script>
</head>`
  );


// =============================================================================
// Existing config (unchanged)
// =============================================================================

const ALLOWED_ORIGINS = [
  'https://ysb.one',
  'https://www.ysb.one',
];

const PUBLIC_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://proxy.cors.sh/',
  'https://thingproxy.freeboard.io/fetch/',
  'https://api.cors.lol/?url=',
];

const SERVERS_API    = 'https://api.gtacnr.net/cnr/servers';
const PLAYERS_API    = 'https://api.gtacnr.net/cnr/players';
const LEADERBOARD_API = 'https://gtacnr.net/api/leaderboards';
const FIVEM_API      = 'https://servers-frontend.fivem.net/api/servers/single';

const SERVER_ID_MAP         = { NA1: 'US1', NA2: 'US2', EU1: 'EU1' };
const REVERSE_SERVER_ID_MAP = { US1: 'NA1', US2: 'NA2', EU1: 'EU1' };

const FIVEM_CFX = {
  NA1: 'a6aope',
  NA2: 'zlvypp',
  EU1: 'kx98er',
};

const ALLOWED_PROXY_HOSTS = [
  'api.gtacnr.net',
  'gtacnr.net',
  'servers-frontend.fivem.net',
];

const TTL = {
  servers:     20,
  players:     20,
  fivem:       30,
  leaderboard: 21600,
  history:     300,
  embed:      30,    // embed HTML cache at CF edge (seconds)
  embedImage: 600,   // embed PNG stored in KV — only regenerate every 10 minutes
};

// ─── Embed visual config (matches your CSS vars) ──────────────────────────────
const SITE_SPA     = 'https://ysb.one/utils/cnr';   // where real browsers land
const COLOR_ONLINE  = '#22c55e';
const COLOR_RESTART = '#f97316';
const COLOR_OFFLINE = '#ef4444';
const COLOR_BG      = '#0a0a0b';
const COLOR_SURFACE = '#131316';
const COLOR_BORDER  = '#27272a';
const COLOR_TEXT    = '#fafafa';
const COLOR_MUTED   = '#a1a1aa';
const COLOR_ACCENT  = '#f59e0b';

const SERVER_META = {
  NA1: { label: 'North America 1', maxPlayers: 128 },
  NA2: { label: 'North America 2', maxPlayers: 128 },
  EU1: { label: 'Europe 1',        maxPlayers: 128 },
};

// =============================================================================
// CORS (unchanged)
// =============================================================================
function cors(origin) {
  let allowed = ALLOWED_ORIGINS[0];
  if (origin) {
    if (ALLOWED_ORIGINS.includes(origin)) {
      allowed = origin;
    } else if (/^https?:\/\/(localhost|127\.|\[::1\])/.test(origin)) {
      allowed = origin;
    }
  }
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// =============================================================================
// Response helpers (unchanged)
// =============================================================================
function json(data, ttl, origin) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': `public, max-age=${ttl}`,
      ...cors(origin),
    },
  });
}

function err(status, message, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...cors(origin),
    },
  });
}

// =============================================================================
// Fetch with fallback chain (unchanged)
// =============================================================================
async function fetchWithFallback(url) {
  try {
    const r = await fetch(url, {
      signal:  AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'cnrtracker/1.0' },
      cf:      { cacheTtl: 10, cacheEverything: false },
    });
    if (r.ok) return await r.json();
    if (r.status === 429) {
      const e = new Error('rate_limited');
      e.code = 429;
      throw e;
    }
  } catch (e) {
    if (e.code === 429) throw e;
  }

  for (const proxy of PUBLIC_PROXIES) {
    try {
      const proxied = proxy + encodeURIComponent(url);
      const r = await fetch(proxied, {
        signal:  AbortSignal.timeout(7000),
        headers: { 'User-Agent': 'cnrtracker/1.0' },
      });
      if (r.ok) {
        const text = await r.text();
        try   { return JSON.parse(text); }
        catch { continue; }
      }
    } catch { continue; }
  }

  // Last resort: resolve the hostname via Cloudflare's own DoH API and hit the
  // server by IP directly over HTTP with a Host header.
  // If the server redirects http→https the redirect is followed using the real
  // domain name, which works fine.  This sidesteps any intermediate routing or
  // DNS-based blocking that caused both the direct fetch and all proxies to fail.
  try {
    return await fetchViaIp(url);
  } catch { /* intentional — fall through to final throw */ }

  throw new Error('All upstream sources failed');
}

// Resolve a hostname → IPv4 address using Cloudflare DNS-over-HTTPS.
// Returns null if resolution fails for any reason.
async function resolveViaDoH(hostname) {
  try {
    const r = await fetch(
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      {
        headers: { 'Accept': 'application/dns-json' },
        signal:  AbortSignal.timeout(3000),
      }
    );
    if (!r.ok) return null;
    const data = await r.json();
    // Pick the first A record
    const record = data.Answer?.find(a => a.type === 1);
    return record?.data || null;
  } catch {
    return null;
  }
}

// Fetch a URL by IP address using the Host header so the server responds
// correctly.  Tries HTTP first (avoids TLS cert-mismatch on raw IP), and lets
// any http→https redirect follow naturally back to the real domain.
async function fetchViaIp(originalUrl) {
  const parsed = new URL(originalUrl);
  const ip = await resolveViaDoH(parsed.hostname);
  if (!ip) throw new Error('DoH resolution returned no A record');

  const httpTarget = `http://${ip}${parsed.pathname}${parsed.search}`;
  const r = await fetch(httpTarget, {
    redirect: 'follow',   // if server redirects to https://domain, that still works
    headers: {
      'Host':       parsed.hostname,
      'User-Agent': 'cnrtracker/1.0',
    },
    signal: AbortSignal.timeout(6000),
  });
  if (r.ok) return await r.json();
  throw new Error(`IP-direct fetch returned HTTP ${r.status}`);
}

// =============================================================================
// Cached fetcher (unchanged)
// =============================================================================
const inflight = new Map();

async function cached(env, key, ttl, url) {
  if (inflight.has(key)) return await inflight.get(key);

  const promise = (async () => {
    const stored = await env.CNR_CACHE.get(key, 'json');
    if (stored && stored._ts && Date.now() - stored._ts < ttl * 1000) {
      return stored.data;
    }

    const cooling = await env.CNR_CACHE.get(`429:${key}`);
    if (cooling) {
      if (stored) return stored.data;
      throw new Error('Upstream cooling down, no stale data available');
    }

    try {
      const data = await fetchWithFallback(url);
      await env.CNR_CACHE.put(
        key,
        JSON.stringify({ data, _ts: Date.now() }),
        { expirationTtl: Math.max(ttl * 4, 60) }
      );
      return data;
    } catch (e) {
      if (e.code === 429) {
        await env.CNR_CACHE.put(`429:${key}`, '1', { expirationTtl: 300 });
      }
      if (stored) return stored.data;
      throw e;
    }
  })();

  inflight.set(key, promise);
  try    { return await promise; }
  finally { inflight.delete(key); }
}

// =============================================================================
// Existing route handlers (unchanged)
// =============================================================================
async function handleServers(env, origin) {
  const data = await cached(env, 'servers', TTL.servers, SERVERS_API);
  const translated = Array.isArray(data)
    ? data.map(s => ({ ...s, Id: REVERSE_SERVER_ID_MAP[s.Id] || s.Id }))
    : data;
  return json(translated, TTL.servers, origin);
}

async function handlePlayers(url, env, origin) {
  const server = url.searchParams.get('server');
  const apiId  = SERVER_ID_MAP[server];
  if (!apiId) return err(400, 'Invalid or missing server (expected NA1, NA2, or EU1)', origin);
  const data = await cached(
    env, `players:${apiId}`, TTL.players,
    `${PLAYERS_API}?serverId=${apiId}`
  );
  return json(data, TTL.players, origin);
}

async function handleLeaderboard(url, env, origin) {
  const region = url.searchParams.get('region');
  const stat   = url.searchParams.get('stat');
  const page   = url.searchParams.get('page') || '1';
  if (!region || !stat) return err(400, 'Missing region or stat', origin);
  if (!/^[A-Za-z_0-9]+$/.test(stat) || !/^[A-Z]+$/.test(region) || !/^\d+$/.test(page)) {
    return err(400, 'Invalid parameters', origin);
  }
  const data = await cached(
    env, `lb:${region}:${stat}:${page}`, TTL.leaderboard,
    `${LEADERBOARD_API}/${region}/${stat}/${page}`
  );
  return json(data, TTL.leaderboard, origin);
}

async function handleFivem(url, env, origin) {
  const server = url.searchParams.get('server');
  const cfx    = FIVEM_CFX[server];
  if (!cfx) return err(400, 'Invalid server', origin);
  const data = await cached(env, `fivem:${server}`, TTL.fivem, `${FIVEM_API}/${cfx}`);
  return json(data, TTL.fivem, origin);
}

async function handleHistory(url, env, origin) {
  const server = url.searchParams.get('server');
  if (!server || !FIVEM_CFX[server]) return err(400, 'Invalid server', origin);
  const days = [];
  const now  = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const dateKey   = d.toISOString().split('T')[0];
    const snapshots = await env.CNR_CACHE.get(`history:${server}:${dateKey}`, 'json');
    if (snapshots && Array.isArray(snapshots) && snapshots.length) {
      days.push({ date: dateKey, snapshots });
    }
  }
  return json({ server, days }, TTL.history, origin);
}

async function handleProxy(url, origin) {
  const target = url.searchParams.get('url');
  if (!target) return err(400, 'Missing url parameter', origin);
  let targetUrl;
  try   { targetUrl = new URL(target); }
  catch { return err(400, 'Invalid url', origin); }
  if (!ALLOWED_PROXY_HOSTS.includes(targetUrl.hostname)) {
    return err(403, 'Host not in allowlist', origin);
  }
  try {
    const r    = await fetch(target, {
      signal:  AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'cnrtracker/1.0' },
    });
    const text = await r.text();
    return new Response(text, {
      status:  r.status,
      headers: {
        'Content-Type':  r.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'public, max-age=20',
        ...cors(origin),
      },
    });
  } catch (e) {
    return err(502, 'Upstream proxy fetch failed', origin);
  }
}

// =============================================================================
// NEW — Live status aggregator (reuses your existing cached())
// Returns { NA1: { online, restarting, players, maxPlayers, label }, ... }
// =============================================================================
async function fetchEmbedStatus(env) {
  // Fetch servers list + all three player counts in parallel, reusing KV cache
  const [serverList, playersNA1, playersNA2, playersEU1] = await Promise.all([
    cached(env, 'servers', TTL.servers, SERVERS_API).catch(() => []),
    cached(env, 'players:US1', TTL.players, `${PLAYERS_API}?serverId=US1`).catch(() => []),
    cached(env, 'players:US2', TTL.players, `${PLAYERS_API}?serverId=US2`).catch(() => []),
    cached(env, 'players:EU1', TTL.players, `${PLAYERS_API}?serverId=EU1`).catch(() => []),
  ]);

  const playerCounts = {
    NA1: Array.isArray(playersNA1) ? playersNA1.length : 0,
    NA2: Array.isArray(playersNA2) ? playersNA2.length : 0,
    EU1: Array.isArray(playersEU1) ? playersEU1.length : 0,
  };

  const now    = Date.now();
  const status = {};

  for (const id of ['NA1', 'NA2', 'EU1']) {
    // serverList still uses upstream IDs (US1/US2) — match either way
    const live = Array.isArray(serverList)
      ? serverList.find(s => s.Id === id || REVERSE_SERVER_ID_MAP[s.Id] === id)
      : null;

    let online = false, restarting = false;
    let maxPlayers = SERVER_META[id].maxPlayers;

    if (live) {
      restarting = live.RestartTimer != null && live.RestartTimer <= 90;
      maxPlayers = live.MaxPlayers || maxPlayers;
    }
    // Use player count as source of truth — LastHeartbeatDateTime is unreliable
    online = playerCounts[id] > 0;

    status[id] = {
      online,
      restarting,
      players:    playerCounts[id],
      maxPlayers,
      label:      SERVER_META[id].label,
    };
  }

  return status;
}

// =============================================================================
// Bot detection
// =============================================================================
const BOT_UA_RE = /bot|crawl|spider|discord|slack|telegram|whatsapp|twitter|facebook|linkedin|google|bing|yahoo|duckduck|baidu|yandex|opengraph|preview|embed|unfurl|fetch|curl|python|java|ruby|go-http/i;

function isEmbedBot(request) {
  return BOT_UA_RE.test(request.headers.get('user-agent') || '');
}

// =============================================================================
// NEW — Embed HTML  GET /embed  or  GET /embed/na1  (etc.)
// Discord reads <head> OG tags. Real browsers get a meta-refresh to the SPA.
// =============================================================================
async function handleEmbed(serverId, request, env) {
  const status     = await fetchEmbedStatus(env);
  const baseUrl    = new URL(request.url).origin; // https://cnr.ysb.one
  const imageUrl   = `${baseUrl}/embed-image${serverId ? '/' + serverId.toLowerCase() : ''}`;
  const spaTarget  = serverId
    ? `${SITE_SPA}#/${serverId.toLowerCase()}`
    : SITE_SPA;

  let title, description, themeColor;

  if (serverId && status[serverId]) {
    const s         = status[serverId];
    const state     = s.restarting ? 'Restarting' : s.online ? 'Online' : 'Offline';
    const emoji     = s.restarting ? '🟠' : s.online ? '🟢' : '🔴';
    themeColor      = s.restarting ? COLOR_RESTART : s.online ? COLOR_ONLINE : COLOR_OFFLINE;
    title           = `CNR Tracker · ${serverId} · ${emoji} ${state}`;

    const others = Object.entries(status)
      .filter(([id]) => id !== serverId)
      .map(([id, sv]) => `${id}: ${sv.online ? `${sv.players}/${sv.maxPlayers}` : 'offline'}`)
      .join('  ·  ');

    description = s.online
      ? `${s.players} / ${s.maxPlayers} players currently online\n${others}`
      : `${serverId} is currently ${state.toLowerCase()}\n${others}`;
  } else {
    // Overview embed — all servers
    const anyOnline    = Object.values(status).some(s => s.online);
    const totalPlayers = Object.values(status).reduce((n, s) => n + s.players, 0);
    themeColor  = anyOnline ? COLOR_ONLINE : COLOR_OFFLINE;
    title       = 'CNR Tracker · Live Server Status';
    description = Object.entries(status)
      .map(([id, s]) => {
        const emoji = s.restarting ? '🟠' : s.online ? '🟢' : '🔴';
        return `${emoji} ${id}: ${s.online ? `${s.players}/${s.maxPlayers} players` : 'offline'}`;
      }).join('\n') + `\n\nTotal: ${totalPlayers} players online`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">

  <meta property="og:type"         content="website">
  <meta property="og:url"          content="${esc(request.url)}">
  <meta property="og:title"        content="${esc(title)}">
  <meta property="og:description"  content="${esc(description)}">
  <meta property="og:image"        content="${esc(imageUrl)}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name"    content="CNR Tracker">

  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image"       content="${esc(imageUrl)}">

  <meta name="theme-color" content="${themeColor}">
  <meta http-equiv="refresh" content="0; url=${esc(spaTarget)}">

  <style>
    body { background:#0a0a0b; color:#fafafa; font-family:system-ui,sans-serif;
           display:flex; align-items:center; justify-content:center;
           height:100vh; margin:0; }
    a { color:#f59e0b; }
  </style>
</head>
<body>
  <p>Redirecting to <a href="${esc(spaTarget)}">CNR Tracker</a>…</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': `public, max-age=${TTL.embed}, stale-while-revalidate=60`,
    },
  });
}

// =============================================================================
// NEW — Embed image PNG  GET /embed-image  or  GET /embed-image/na1
//
// Flow:
//   1. Check KV for a PNG cached within the last 10 minutes → serve it cold.
//   2. Fetch live status data (uses your existing cached() KV layer).
//   3. Confirm data is real before generating — if everything reads 0 players
//      and offline, the upstream is probably down; serve any stale cached PNG
//      rather than writing a garbage card.
//   4. Build SVG → resvg-wasm → PNG → store in KV → return.
// =============================================================================
async function handleEmbedImage(serverId, request, env) {
  // /embed-image/purge — wipe all cached SVGs and regenerate fresh
  if (new URL(request.url).pathname === '/embed-image/purge') {
    await Promise.all([
      env.CNR_CACHE.delete('embed-svg-v1:overview'),
      env.CNR_CACHE.delete('embed-svg-v1:NA1'),
      env.CNR_CACHE.delete('embed-svg-v1:NA2'),
      env.CNR_CACHE.delete('embed-svg-v1:EU1'),
    ]);
    return new Response('cache purged', { headers: { 'Content-Type': 'text/plain' } });
  }

  const kvKey = `embed-svg-v1:${serverId || 'overview'}`;

  // ── 1. Check KV cache (10 min TTL) ──────────────────────────────────────────
  try {
    const cachedSvg = await env.CNR_CACHE.get(kvKey, 'text');
    if (cachedSvg) {
      const b64    = btoa(unescape(encodeURIComponent(cachedSvg)));
      const pngUrl = `https://images.weserv.nl/?url=${encodeURIComponent('data:image/svg+xml;base64,' + b64)}&output=png&w=1200&h=630`;
      return Response.redirect(pngUrl, 302);
    }
  } catch { /* miss — fall through */ }

  // ── 2. Fetch live status ─────────────────────────────────────────────────────
  const status = await fetchEmbedStatus(env);
  const hasRealData = Object.values(status).some(s => s.online || s.players > 0);

  // ── 3. Build SVG ─────────────────────────────────────────────────────────────
  const svg = serverId && status[serverId]
    ? buildSingleSvg(serverId, status[serverId])
    : buildOverviewSvg(status);

  // ── 4. Cache SVG in KV for 10 min if data is real ───────────────────────────
  if (hasRealData) {
    await env.CNR_CACHE.put(kvKey, svg, { expirationTtl: TTL.embedImage })
      .catch(e => console.error('embed-image: KV write failed', e.message));
  }

  // ── 5. Convert SVG → PNG via images.weserv.nl and redirect ──────────────────
  const b64    = btoa(unescape(encodeURIComponent(svg)));
  const pngUrl = `https://images.weserv.nl/?url=${encodeURIComponent('data:image/svg+xml;base64,' + b64)}&output=png&w=1200&h=630`;
  return Response.redirect(pngUrl, 302);
}

// =============================================================================
// SVG card — single server (1200×630)
// =============================================================================
function buildSingleSvg(id, s) {
  const W = 1200, H = 630;
  const dotCol    = s.restarting ? COLOR_RESTART : s.online ? COLOR_ONLINE : '#52525b';
  const stateText = s.restarting ? 'RESTARTING'  : s.online ? 'ONLINE'     : 'OFFLINE';
  const pct       = s.online ? Math.min(s.players / s.maxPlayers, 1) : 0;
  const barFill   = (680 * pct).toFixed(1);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0L0 0 0 32" fill="none" stroke="rgba(255,255,255,0.018)" stroke-width="0.5"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="${COLOR_BG}"/>
  <rect width="${W}" height="${H}" fill="url(#g)"/>

  <!-- Top accent bar, colored by status -->
  <rect x="0" y="0" width="${W}" height="4" fill="${dotCol}"/>
  <!-- Left accent line -->
  <rect x="0" y="0" width="4" height="${H}" fill="${dotCol}" opacity="0.3"/>

  <!-- Status dot -->
  <circle cx="108" cy="108" r="13" fill="${dotCol}"/>
  ${s.online ? `<circle cx="108" cy="108" r="21" fill="none" stroke="${dotCol}" stroke-width="1.5" opacity="0.3"/>` : ''}

  <!-- Server ID -->
  <text x="142" y="125" font-family="Impact,Arial Black,sans-serif"
        font-size="76" font-weight="900" letter-spacing="4" fill="${COLOR_TEXT}">${id}</text>

  <!-- Status pill -->
  <rect x="144" y="148" width="${stateText.length * 11 + 26}" height="30" rx="5"
        fill="${dotCol}" opacity="0.12"/>
  <rect x="144" y="148" width="${stateText.length * 11 + 26}" height="30" rx="5"
        fill="none" stroke="${dotCol}" stroke-width="0.8"/>
  <text x="157" y="168" font-family="monospace" font-size="12" font-weight="700"
        letter-spacing="3" fill="${dotCol}">${stateText}</text>

  <!-- Region label -->
  <text x="145" y="222" font-family="monospace" font-size="14" letter-spacing="2"
        fill="${COLOR_MUTED}">${s.label.toUpperCase()}</text>

  <!-- Hero player number -->
  <text x="76" y="400" font-family="Impact,Arial Black,sans-serif"
        font-size="210" font-weight="900" fill="${COLOR_TEXT}">${s.players}</text>

  <!-- /max suffix -->
  <text x="76" y="448" font-family="monospace" font-size="26" fill="${COLOR_MUTED}">/ ${s.maxPlayers} max players</text>

  <!-- Progress bar track -->
  <rect x="76" y="474" width="680" height="9" rx="4.5" fill="${COLOR_BORDER}"/>
  ${+barFill > 0 ? `<rect x="76" y="474" width="${barFill}" height="9" rx="4.5" fill="${dotCol}"/>` : ''}
  <!-- Pct label next to bar -->
  ${s.online ? `<text x="${76 + +barFill + 14}" y="482"
        font-family="monospace" font-size="13" fill="${COLOR_MUTED}"
        dominant-baseline="middle">${Math.round(pct * 100)}%</text>` : ''}

  <!-- Watermark logo (top-right) -->
  <text x="${W - 72}" y="108" text-anchor="end" font-family="Impact,Arial Black,sans-serif"
        font-size="28" font-weight="900" letter-spacing="2"
        fill="${COLOR_TEXT}" opacity="0.3">CNR<tspan fill="${COLOR_ACCENT}">TRACKER</tspan></text>
  <text x="${W - 72}" y="132" text-anchor="end" font-family="monospace"
        font-size="11" letter-spacing="2" fill="${COLOR_MUTED}" opacity="0.5">ysb.one/utils/cnr</text>

  <!-- Footer -->
  <text x="76" y="${H - 28}" font-family="monospace" font-size="11" letter-spacing="2"
        fill="${COLOR_MUTED}">LIVE · GTA CRIME AND ROBBERY</text>
  <text x="${W - 72}" y="${H - 28}" text-anchor="end" font-family="monospace"
        font-size="11" letter-spacing="2" fill="${COLOR_MUTED}">gtacnr.net · fivem.net</text>
</svg>`;
}

// =============================================================================
// SVG card — all servers overview (1200×630)
// =============================================================================
function buildOverviewSvg(status) {
  const W = 1200, H = 630;
  const anyOnline    = Object.values(status).some(s => s.online);
  const totalPlayers = Object.values(status).reduce((n, s) => n + s.players, 0);
  const accentColor  = anyOnline ? COLOR_ONLINE : COLOR_OFFLINE;

  // Three server cards: x positions 72, 432, 792  (width 300 each)
  const cards = Object.entries(status).map(([id, s], i) => {
    const cx     = 72 + i * 372;
    const dotCol = s.restarting ? COLOR_RESTART : s.online ? COLOR_ONLINE : '#52525b';
    const pct    = s.online ? Math.min(s.players / s.maxPlayers, 1) : 0;
    const barW   = (264 * pct).toFixed(1);
    const state  = s.restarting ? 'RESTARTING' : s.online ? 'ONLINE' : 'OFFLINE';

    return `
    <!-- ── ${id} card ── -->
    <rect x="${cx}" y="206" width="332" height="352" rx="10"
          fill="${COLOR_SURFACE}" stroke="${COLOR_BORDER}" stroke-width="0.5"/>
    <!-- Top accent on card -->
    <rect x="${cx}" y="206" width="332" height="4" rx="2" fill="${dotCol}"/>

    <!-- Status dot + Server ID -->
    <circle cx="${cx + 26}" cy="${206 + 44}" r="6" fill="${dotCol}"/>
    <text x="${cx + 42}" y="${206 + 50}"
          font-family="Impact,Arial Black,sans-serif" font-size="22" font-weight="900"
          letter-spacing="2" fill="${COLOR_TEXT}">${id}</text>

    <!-- State label -->
    <text x="${cx + 26}" y="${206 + 80}"
          font-family="monospace" font-size="10" letter-spacing="3"
          fill="${dotCol}">${state}</text>

    <!-- Region -->
    <text x="${cx + 26}" y="${206 + 108}"
          font-family="monospace" font-size="10" letter-spacing="1"
          fill="${COLOR_MUTED}">${s.label.toUpperCase()}</text>

    <!-- Player count -->
    <text x="${cx + 26}" y="${206 + 200}"
          font-family="Impact,Arial Black,sans-serif" font-size="96" font-weight="900"
          fill="${COLOR_TEXT}">${s.players}</text>
    <text x="${cx + 26}" y="${206 + 232}"
          font-family="monospace" font-size="14" fill="${COLOR_MUTED}">/ ${s.maxPlayers} players</text>

    <!-- Progress bar -->
    <rect x="${cx + 26}" y="${206 + 260}" width="264" height="7" rx="3.5"
          fill="${COLOR_BORDER}"/>
    ${+barW > 0 ? `<rect x="${cx + 26}" y="${206 + 260}" width="${barW}" height="7" rx="3.5"
          fill="${dotCol}"/>` : ''}

    <!-- Fill % -->
    ${s.online ? `<text x="${cx + 26}" y="${206 + 294}"
          font-family="monospace" font-size="11" fill="${COLOR_MUTED}"
          >${Math.round(pct * 100)}% full</text>` : ''}
    `;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0L0 0 0 32" fill="none" stroke="rgba(255,255,255,0.018)" stroke-width="0.5"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="${COLOR_BG}"/>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="0" y="0" width="${W}" height="4" fill="${accentColor}"/>

  <!-- Logo -->
  <text x="72" y="120" font-family="Impact,Arial Black,sans-serif"
        font-size="68" font-weight="900" letter-spacing="2"
        fill="${COLOR_TEXT}">CNR<tspan fill="${COLOR_ACCENT}">TRACKER</tspan></text>
  <text x="76" y="150" font-family="monospace" font-size="12" letter-spacing="3"
        fill="${COLOR_MUTED}">ysb.one/utils/cnr · LIVE</text>

  <!-- Total badge (top-right) -->
  <rect x="${W - 292}" y="80" width="220" height="58" rx="8"
        fill="${COLOR_SURFACE}" stroke="${COLOR_BORDER}" stroke-width="0.5"/>
  <text x="${W - 292 + 18}" y="104" font-family="monospace"
        font-size="10" letter-spacing="3" fill="${COLOR_MUTED}">TOTAL ONLINE</text>
  <text x="${W - 292 + 18}" y="130" font-family="Impact,Arial Black,sans-serif"
        font-size="30" font-weight="900" fill="${COLOR_TEXT}">${totalPlayers} players</text>

  ${cards}

  <!-- Footer -->
  <text x="72" y="${H - 24}" font-family="monospace" font-size="11" letter-spacing="2"
        fill="${COLOR_MUTED}">GTA CRIME AND ROBBERY</text>
  <text x="${W - 72}" y="${H - 24}" text-anchor="end" font-family="monospace"
        font-size="11" letter-spacing="2" fill="${COLOR_MUTED}">gtacnr.net · fivem.net</text>
</svg>`;
}

// =============================================================================
// HTML escape
// =============================================================================
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// =============================================================================
// Main request handler
// =============================================================================
async function handleRequest(request, env) {
  const url    = new URL(request.url);
  const origin = request.headers.get('Origin') || '';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (request.method !== 'GET') {
    return err(405, 'Method not allowed', origin);
  }

  // ── Pretty server URLs: /na1  /na2  /eu1 ────────────────────────────────
  // Bots (Discord, etc.) get the embed HTML with OG tags.
  // Real browsers get the full SPA — the injected script converts path→hash.
  const serverSlugMatch = url.pathname.match(/^\/([a-z0-9]+)$/i);
  if (serverSlugMatch) {
    const raw      = serverSlugMatch[1].toUpperCase();
    const serverId = SERVER_META[raw] ? raw : null;
    if (serverId) {
      if (isEmbedBot(request)) {
        return handleEmbed(serverId, request, env);
      }
      // Real browser — serve the SPA (the injected script handles hash routing)
      return new Response(CNR_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  // ── Root: serve SPA ───────────────────────────────────────────────────────
  if (url.pathname === '/') {
    // Bots hitting bare root get the all-servers overview embed
    if (isEmbedBot(request)) {
      return handleEmbed(null, request, env);
    }
    return new Response(CNR_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // ── Embed image endpoint ──────────────────────────────────────────────────
  const embedImageMatch = url.pathname.match(/^\/embed-image\/?([a-z0-9]*)$/i);
  if (embedImageMatch) {
    const raw      = (embedImageMatch[1] || '').toUpperCase();
    const serverId = SERVER_META[raw] ? raw : null;
    return handleEmbedImage(serverId, request, env);
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    switch (url.pathname) {
      case '/test':
        return new Response('new code is live', { headers: { 'Content-Type': 'text/plain' } });
      case '/status':
        return new Response('cnr tracker worker · ok\n', {
          headers: { 'Content-Type': 'text/plain', ...cors(origin) },
        });
      case '/api/servers':
        return await handleServers(env, origin);
      case '/api/players':
        return await handlePlayers(url, env, origin);
      case '/api/leaderboard':
        return await handleLeaderboard(url, env, origin);
      case '/api/fivem':
        return await handleFivem(url, env, origin);
      case '/api/history':
        return await handleHistory(url, env, origin);
      case '/proxy':
        return await handleProxy(url, origin);
      default:
        return err(404, 'Not found', origin);
    }
  } catch (e) {
    console.error('handler error', url.pathname, e);
    return err(500, e.message || 'Internal error', origin);
  }
}

// =============================================================================
// Scheduled handler (unchanged)
// =============================================================================
async function handleScheduled(env) {
  try {
    const data = await fetchWithFallback(SERVERS_API);
    if (!Array.isArray(data)) return;
    const now    = new Date();
    const dateKey = now.toISOString().split('T')[0];
    const timeKey = now.toISOString();
    for (const s of data) {
      const localId = REVERSE_SERVER_ID_MAP[s.Id];
      if (!localId) continue;
      const histKey = `history:${localId}:${dateKey}`;
      let day = await env.CNR_CACHE.get(histKey, 'json');
      if (!Array.isArray(day)) day = [];
      day.push({ t: timeKey, players: s.Players, queue: s.QueuedPlayers, max: s.MaxPlayers });
      await env.CNR_CACHE.put(histKey, JSON.stringify(day), { expirationTtl: 7 * 24 * 3600 });
    }
  } catch (e) {
    console.error('cron error', e);
  }
}

// =============================================================================
// Export (unchanged)
// =============================================================================
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },
};