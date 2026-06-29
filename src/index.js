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
import cnrHtmlRaw      from './cnr.html';
// Note: serve sw.js and shared-worker.js by fetching their raw text at runtime
// to avoid bundler/module object coercion when returning as a Response.
import manifestJson    from './manifest.json';
import bebasNeueFont   from './fonts/BebasNeue.woff2';
import ibmPlexSansFont from './fonts/IBMPlexSans.woff2';
import jetBrainsMonoFont from './fonts/JetBrainsMono.woff2';
const SHARED_WORKER_JS = atob('Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCi8vIENOUiBUcmFja2VyIMOi4oKs4oCdIFNoYXJlZCBXb3JrZXINCi8vIEFsbCB0YWJzIHNoYXJlIG9uZSBwb2xsaW5nIGxvb3AgaW5zdGVhZCBvZiBlYWNoIHBvbGxpbmcgaW5kZXBlbmRlbnRseS4NCi8vIFRhYnMgdHJhY2sgdGhlaXIgb3duIHNlbGVjdGVkIHNlcnZlciBpbmRlcGVuZGVudGx5Lg0KLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCg0KY29uc3QgQVBJX0JBU0UgICA9ICh0eXBlb2YgbG9jYXRpb24gIT09ICd1bmRlZmluZWQnICYmIGxvY2F0aW9uLm9yaWdpbikgPyBsb2NhdGlvbi5vcmlnaW4gOiAnaHR0cHM6Ly9jbnIueXNiLm9uZSc7DQpjb25zdCBESVJFQ1RfQVBJID0gJ2h0dHBzOi8vYXBpLmd0YWNuci5uZXQvY25yJzsNCmNvbnN0IEZJVkVNX0FQSSAgPSAnaHR0cHM6Ly9zZXJ2ZXJzLWZyb250ZW5kLmZpdmVtLm5ldC9hcGkvc2VydmVycy9zaW5nbGUnOw0KDQpjb25zdCBGSVZFTV9DRlggPSB7IE5BMTogJ2E2YW9wZScsIE5BMjogJ3psdnlwcCcsIEVVMTogJ2t4OThlcicgfTsNCmNvbnN0IEFQSV9JRFMgICA9IHsgTkExOiAnVVMxJywgTkEyOiAnVVMyJywgRVUxOiAnRVUxJyB9Ow0KDQpjb25zdCBQT0xMX0lOVEVSVkFMID0gMzAwMDA7IC8vIDMwcw0KDQovLyBDb25uZWN0ZWQgcG9ydHMgKG9uZSBwZXIgdGFiKQ0KY29uc3QgcG9ydHMgPSBuZXcgU2V0KCk7DQoNCi8vIFNoYXJlZCBkYXRhIHN0b3JlDQpjb25zdCBzdG9yZSA9IHsNCiAgc2VydmVyczogICAgIG51bGwsDQogIHBsYXllcnM6ICAgICB7IE5BMTogbnVsbCwgTkEyOiBudWxsLCBFVTE6IG51bGwgfSwNCiAgZml2ZW06ICAgICAgIHsgTkExOiBudWxsLCBOQTI6IG51bGwsIEVVMTogbnVsbCB9LA0KICBsYXN0RmV0Y2g6ICAgeyBzZXJ2ZXJzOiAwLCBOQTE6IDAsIE5BMjogMCwgRVUxOiAwIH0sDQogIGVycm9yczogICAgICB7fSwNCn07DQoNCi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09DQovLyBDb25uZWN0aW9uIGhhbmRsZXINCi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09DQpzZWxmLm9uY29ubmVjdCA9IGV2ZW50ID0+IHsNCiAgY29uc3QgcG9ydCA9IGV2ZW50LnBvcnRzWzBdOw0KICBwb3J0cy5hZGQocG9ydCk7DQoNCiAgcG9ydC5vbm1lc3NhZ2UgPSBlID0+IGhhbmRsZU1lc3NhZ2UocG9ydCwgZS5kYXRhKTsNCg0KICBwb3J0Lm9uY2xvc2UgPSAoKSA9PiBwb3J0cy5kZWxldGUocG9ydCk7DQoNCiAgLy8gU2VuZCBjdXJyZW50IGRhdGEgaW1tZWRpYXRlbHkgdG8gbmV3IHRhYg0KICBwb3J0LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0lOSVQnLCBkYXRhOiBnZXRTbmFwc2hvdCgpIH0pOw0KDQogIHBvcnQuc3RhcnQoKTsNCn07DQoNCi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09DQovLyBNZXNzYWdlIGhhbmRsZXINCi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09DQpmdW5jdGlvbiBoYW5kbGVNZXNzYWdlKHBvcnQsIG1zZykgew0KICBzd2l0Y2ggKG1zZy50eXBlKSB7DQogICAgY2FzZSAnRkVUQ0hfU0VSVkVSJzoNCiAgICAgIC8vIFRhYiBpcyBzd2l0Y2hpbmcgdG8gYSBzZXJ2ZXIgw6LigqzigJ0gZW5zdXJlIGl0cyBkYXRhIGlzIGZyZXNoDQogICAgICBlbnN1cmVTZXJ2ZXJEYXRhKG1zZy5zZXJ2ZXIpOw0KICAgICAgYnJlYWs7DQogICAgY2FzZSAnRk9SQ0VfUkVGUkVTSCc6DQogICAgICBmZXRjaEFsbCgpOw0KICAgICAgYnJlYWs7DQogIH0NCn0NCg0KLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCi8vIEJyb2FkY2FzdCB0byBhbGwgY29ubmVjdGVkIHRhYnMNCi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09DQpmdW5jdGlvbiBicm9hZGNhc3QobXNnKSB7DQogIGZvciAoY29uc3QgcG9ydCBvZiBwb3J0cykgew0KICAgIHRyeSB7IHBvcnQucG9zdE1lc3NhZ2UobXNnKTsgfSBjYXRjaCAoZSkgeyBwb3J0cy5kZWxldGUocG9ydCk7IH0NCiAgfQ0KfQ0KDQovLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQ0KLy8gRmV0Y2ggaGVscGVycw0KLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCmFzeW5jIGZ1bmN0aW9uIHRyeUZldGNoKHVybCwgdGltZW91dCA9IDYwMDApIHsNCiAgY29uc3QgciA9IGF3YWl0IGZldGNoKHVybCwgeyBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQodGltZW91dCkgfSk7DQogIGlmICghci5vaykgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7ci5zdGF0dXN9YCk7DQogIHJldHVybiByLmpzb24oKTsNCn0NCg0KYXN5bmMgZnVuY3Rpb24gZmV0Y2hXaXRoRmFsbGJhY2soZGlyZWN0VXJsLCB3b3JrZXJQYXRoKSB7DQogIC8vIFRyeSBkaXJlY3QgZmlyc3QNCiAgdHJ5IHsgcmV0dXJuIGF3YWl0IHRyeUZldGNoKGRpcmVjdFVybCwgNTAwMCk7IH0gY2F0Y2ggKGUpIHt9DQogIC8vIFRyeSB3b3JrZXINCiAgdHJ5IHsgcmV0dXJuIGF3YWl0IHRyeUZldGNoKGAke0FQSV9CQVNFfSR7d29ya2VyUGF0aH1gLCA4MDAwKTsgfSBjYXRjaCAoZSkge30NCiAgdGhyb3cgbmV3IEVycm9yKCdBbGwgc291cmNlcyBmYWlsZWQnKTsNCn0NCg0KLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCi8vIERhdGEgZmV0Y2hlcnMNCi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09DQphc3luYyBmdW5jdGlvbiBmZXRjaFNlcnZlcnMoKSB7DQogIHRyeSB7DQogICAgY29uc3QgcmF3ID0gYXdhaXQgZmV0Y2hXaXRoRmFsbGJhY2soDQogICAgICBgJHtESVJFQ1RfQVBJfS9zZXJ2ZXJzYCwNCiAgICAgICcvYXBpL3NlcnZlcnMnDQogICAgKTsNCiAgICBjb25zdCBkYXRhID0gQXJyYXkuaXNBcnJheShyYXcpDQogICAgICA/IHJhdy5tYXAocyA9PiAoeyAuLi5zLCBJZDogeyBVUzE6ICdOQTEnLCBVUzI6ICdOQTInLCBFVTE6ICdFVTEnIH1bcy5JZF0gfHwgcy5JZCB9KSkNCiAgICAgIDogcmF3Ow0KICAgIHN0b3JlLnNlcnZlcnMgICA9IGRhdGE7DQogICAgc3RvcmUubGFzdEZldGNoLnNlcnZlcnMgPSBEYXRlLm5vdygpOw0KICAgIHN0b3JlLmVycm9ycy5zZXJ2ZXJzICAgID0gbnVsbDsNCiAgICBicm9hZGNhc3QoeyB0eXBlOiAnU0VSVkVSU19VUERBVEUnLCBkYXRhIH0pOw0KICB9IGNhdGNoIChlKSB7DQogICAgc3RvcmUuZXJyb3JzLnNlcnZlcnMgPSBlLm1lc3NhZ2U7DQogICAgYnJvYWRjYXN0KHsgdHlwZTogJ1NFUlZFUlNfRVJST1InLCBlcnJvcjogZS5tZXNzYWdlIH0pOw0KICB9DQp9DQoNCmFzeW5jIGZ1bmN0aW9uIGZldGNoUGxheWVycyhzZXJ2ZXIpIHsNCiAgY29uc3QgYXBpSWQgPSBBUElfSURTW3NlcnZlcl07DQogIHRyeSB7DQogICAgY29uc3QgZGF0YSA9IGF3YWl0IGZldGNoV2l0aEZhbGxiYWNrKA0KICAgICAgYCR7RElSRUNUX0FQSX0vcGxheWVycz9zZXJ2ZXJJZD0ke2FwaUlkfWAsDQogICAgICBgL2FwaS9wbGF5ZXJzP3NlcnZlcj0ke3NlcnZlcn1gDQogICAgKTsNCiAgICBzdG9yZS5wbGF5ZXJzW3NlcnZlcl0gICA9IGRhdGE7DQogICAgc3RvcmUubGFzdEZldGNoW3NlcnZlcl0gPSBEYXRlLm5vdygpOw0KICAgIHN0b3JlLmVycm9yc1tzZXJ2ZXJdICAgID0gbnVsbDsNCiAgICBicm9hZGNhc3QoeyB0eXBlOiAnUExBWUVSU19VUERBVEUnLCBzZXJ2ZXIsIGRhdGEgfSk7DQogIH0gY2F0Y2ggKGUpIHsNCiAgICBzdG9yZS5lcnJvcnNbc2VydmVyXSA9IGUubWVzc2FnZTsNCiAgICBicm9hZGNhc3QoeyB0eXBlOiAnUExBWUVSU19FUlJPUicsIHNlcnZlciwgZXJyb3I6IGUubWVzc2FnZSB9KTsNCiAgfQ0KfQ0KDQphc3luYyBmdW5jdGlvbiBmZXRjaEZpdmVtKHNlcnZlcikgew0KICBjb25zdCBjZnggPSBGSVZFTV9DRlhbc2VydmVyXTsNCiAgdHJ5IHsNCiAgICBjb25zdCBkYXRhID0gYXdhaXQgdHJ5RmV0Y2goYCR7RklWRU1fQVBJfS8ke2NmeH1gLCA1MDAwKQ0KICAgICAgLmNhdGNoKCgpID0+IHRyeUZldGNoKGAke0FQSV9CQVNFfS9hcGkvZml2ZW0/c2VydmVyPSR7c2VydmVyfWAsIDgwMDApKTsNCiAgICBzdG9yZS5maXZlbVtzZXJ2ZXJdID0gZGF0YTsNCiAgICBicm9hZGNhc3QoeyB0eXBlOiAnRklWRU1fVVBEQVRFJywgc2VydmVyLCBkYXRhIH0pOw0KICB9IGNhdGNoIChlKSB7DQogICAgYnJvYWRjYXN0KHsgdHlwZTogJ0ZJVkVNX0VSUk9SJywgc2VydmVyLCBlcnJvcjogZS5tZXNzYWdlIH0pOw0KICB9DQp9DQoNCmFzeW5jIGZ1bmN0aW9uIGVuc3VyZVNlcnZlckRhdGEoc2VydmVyKSB7DQogIGNvbnN0IGFnZSA9IERhdGUubm93KCkgLSAoc3RvcmUubGFzdEZldGNoW3NlcnZlcl0gfHwgMCk7DQogIGlmIChhZ2UgPiBQT0xMX0lOVEVSVkFMKSB7DQogICAgYXdhaXQgUHJvbWlzZS5hbGwoW2ZldGNoUGxheWVycyhzZXJ2ZXIpLCBmZXRjaEZpdmVtKHNlcnZlcildKTsNCiAgfQ0KfQ0KDQphc3luYyBmdW5jdGlvbiBmZXRjaEFsbCgpIHsNCiAgYXdhaXQgUHJvbWlzZS5hbGwoWw0KICAgIGZldGNoU2VydmVycygpLA0KICAgIGZldGNoUGxheWVycygnTkExJyksDQogICAgZmV0Y2hQbGF5ZXJzKCdOQTInKSwNCiAgICBmZXRjaFBsYXllcnMoJ0VVMScpLA0KICAgIGZldGNoRml2ZW0oJ05BMScpLA0KICAgIGZldGNoRml2ZW0oJ05BMicpLA0KICAgIGZldGNoRml2ZW0oJ0VVMScpLA0KICBdKTsNCn0NCg0KZnVuY3Rpb24gZ2V0U25hcHNob3QoKSB7DQogIHJldHVybiB7DQogICAgc2VydmVyczogc3RvcmUuc2VydmVycywNCiAgICBwbGF5ZXJzOiBzdG9yZS5wbGF5ZXJzLA0KICAgIGZpdmVtOiAgIHN0b3JlLmZpdmVtLA0KICAgIGVycm9yczogIHN0b3JlLmVycm9ycywNCiAgfTsNCn0NCg0KLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCi8vIFBvbGxpbmcgbG9vcA0KLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCmFzeW5jIGZ1bmN0aW9uIHBvbGwoKSB7DQogIGlmIChwb3J0cy5zaXplID4gMCkgew0KICAgIGF3YWl0IGZldGNoQWxsKCk7DQogIH0NCiAgc2V0VGltZW91dChwb2xsLCBQT0xMX0lOVEVSVkFMKTsNCn0NCg0KLy8gU3RhcnQgcG9sbGluZw0KcG9sbCgpOw==');
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
const FIVEM_API      = 'https://frontend.cfx-services.net/api/servers/single';

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
  'frontend.cfx-services.net',
];

const TTL = {
  servers:     20,
  players:     20,
  fivem:       30,
  leaderboard: 604800,
  history:     300,
  embed:      30,    // embed HTML cache at CF edge (seconds)
  embedImage: 600,   // CF edge cache TTL for embed SVG responses
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
  NA1: { label: 'North America 1', location: 'Chicago, USA',      maxPlayers: 128 },
  NA2: { label: 'North America 2', location: 'Chicago, USA',      maxPlayers: 128 },
  EU1: { label: 'Europe 1',        location: 'Frankfurt, Germany', maxPlayers: 128 },
};

const SVG_FONTS = {
  display: "'Bebas Neue', Impact, sans-serif",
  body: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', Consolas, monospace",
};

function getSvgFontFaceCss(baseUrl) {
  return `
    @font-face {
      font-family: 'Bebas Neue';
      src: url('${baseUrl}/fonts/BebasNeue.woff2') format('woff2');
      font-style: normal;
      font-weight: 400;
      font-display: swap;
    }
    @font-face {
      font-family: 'IBM Plex Sans';
      src: url('${baseUrl}/fonts/IBMPlexSans.woff2') format('woff2');
      font-style: normal;
      font-weight: 400 700;
      font-display: swap;
    }
    @font-face {
      font-family: 'JetBrains Mono';
      src: url('${baseUrl}/fonts/JetBrainsMono.woff2') format('woff2');
      font-style: normal;
      font-weight: 400 700;
      font-display: swap;
    }
  `;
}

function fontResponse(data) {
  return new Response(data, {
    headers: {
      'Content-Type':  'font/woff2',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

function formatUtcStamp(date = new Date()) {
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
}

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
  } catch (e) {
    // Fall through to proxy and IP-direct fallback paths.
  }

  // Race all proxies in parallel — take the first success
  try {
    const proxyResults = await Promise.any(
      PUBLIC_PROXIES.map(async proxy => {
        const proxied = proxy + encodeURIComponent(url);
        const r = await fetch(proxied, {
          signal:  AbortSignal.timeout(7000),
          headers: { 'User-Agent': 'cnrtracker/1.0' },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        return JSON.parse(text);
      })
    );
    return proxyResults;
  } catch { /* all proxies failed — fall through to DoH */ }

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
// Tiered cache — KV → CF Cache API → in-memory → direct fetch
//
// When KV hits its daily limit (429), the system falls back gracefully:
//   Tier 1: Workers KV (primary, persists across isolates)
//   Tier 2: Cloudflare Cache API (edge cache, zero KV ops, free)
//   Tier 3: Module-level memory map (lasts for isolate lifetime ~30s)
//   Tier 4: Direct upstream fetch (no cache, last resort)
//
// Responses include an X-Cache-Tier header so you can see which tier served it.
// =============================================================================

// Tier 3: module-level memory cache (survives within a single isolate)
const memCache = new Map();

// Rate limiter state for leaderboard API (gtacnr.net has 2 reqs per 5 sec limit)
const LEADERBOARD_RATE_LIMIT = { requests: 2, window: 5000 }; // 2 reqs per 5 sec
const leaderboardInflight = new Map();
const leaderboardBackoff = new Map(); // key -> resetAtMs
const ENABLE_KV_WRITES = true;

// Safe KV wrapper — returns null instead of throwing on 429 or quota errors
async function kvGet(kv, key, type = 'json') {
  try { return await kv.get(key, type); }
  catch (e) {
    console.warn(`[KV] get failed for ${key}:`, e.message);
    return null;
  }
}
async function kvPut(kv, key, value, opts) {
  if (!ENABLE_KV_WRITES) {
    // attempt to buffer the KV write when writes are disabled
    try {
      await bufferKvPut(globalThis.__env__, key, value, opts).catch(() => null);
    } catch { /* swallow */ }
    return;
  }
  // If DO reports KV is blocked, buffer instead of writing
  try {
    if (await isKvBlocked(globalThis.__env__)) {
      await bufferKvPut(globalThis.__env__, key, value, opts).catch(() => null);
      return;
    }
  } catch { /* ignore and try normal put */ }
  try { await kv.put(key, value, opts); }
  catch (e) {
    console.warn(`[KV] put failed for ${key}:`, e.message);
    // If quota error, mark blocked state in the write buffer
    if (isKvQuotaError(e)) {
      try { await markKvBlocked(globalThis.__env__); } catch { /* best-effort */ }
    }
  }
}

const WRITE_BUFFER_DO = 'CNRWriteBuffer';

function writeBufferStub(env) {
  if (!env.CNR_WRITE_BUFFER) return null;
  return env.CNR_WRITE_BUFFER.get(env.CNR_WRITE_BUFFER.idFromName('global'));
}

async function bufferHistorySnapshot(env, server, dateKey, snapshot) {
  const stub = writeBufferStub(env);
  if (!stub) return false;
  await stub.fetch('https://write-buffer/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'history', server, dateKey, snapshot }),
  });
  return true;
}

async function bufferLeaderboardWarm(env, key, data, ttlSeconds) {
  const stub = writeBufferStub(env);
  if (!stub) return false;
  await stub.fetch('https://write-buffer/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'leaderboard', key, data, ttlSeconds }),
  });
  return true;
}

async function bufferKvPut(env, key, value, opts) {
  const stub = writeBufferStub(env);
  if (!stub) return false;
  const ttlSeconds = opts && opts.expirationTtl ? opts.expirationTtl : 0;
  await stub.fetch('https://write-buffer/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'raw', key, value, ttlSeconds }),
  });
  return true;
}

// Ask the DO to mark KV as blocked until next reset window
async function markKvBlocked(env) {
  const stub = writeBufferStub(env);
  if (!stub) return false;
  await stub.fetch('https://write-buffer/block', { method: 'POST' }).catch(() => null);
  // update local cache
  memCache.set('kvBlocked', { _ts: Date.now(), blocked: true });
  return true;
}

// Check whether KV is currently blocked (cached for 30s)
async function isKvBlocked(env) {
  const cached = memCache.get('kvBlocked');
  const now = Date.now();
  if (cached && (now - cached._ts) < 30 * 1000) return cached.blocked;
  const stub = writeBufferStub(env);
  if (!stub) return false;
  try {
    const r = await stub.fetch('https://write-buffer/state');
    if (!r.ok) return false;
    const s = await r.json();
    const blockedUntil = Number(s?.blockedUntil || 0);
    const blocked = blockedUntil && Date.now() < blockedUntil;
    memCache.set('kvBlocked', { _ts: now, blocked });
    return blocked;
  } catch (e) {
    return false;
  }
}

async function flushBufferedWrites(env) {
  const stub = writeBufferStub(env);
  if (!stub) return null;
  const r = await stub.fetch('https://write-buffer/flush', { method: 'POST' });
  try { return await r.json(); }
  catch { return null; }
}

async function getBufferedHistory(env, server) {
  const stub = writeBufferStub(env);
  if (!stub) return [];
  const r = await stub.fetch(`https://write-buffer/history?server=${encodeURIComponent(server)}`);
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data?.days) ? data.days : [];
}

function isKvQuotaError(err) {
  const text = `${err?.message || ''} ${err?.status || ''} ${err?.code || ''}`.toLowerCase();
  return text.includes('429') || text.includes('too many requests') || text.includes('quota');
}

function nextUtcMidnightPlusBuffer(now = Date.now()) {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime() + 60_000;
}

export class CNRWriteBuffer {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async getDirtyKeys() {
    const dirty = await this.state.storage.get('dirty');
    return Array.isArray(dirty) ? dirty : [];
  }

  async setDirtyKeys(dirty) {
    await this.state.storage.put('dirty', dirty);
  }

  async markDirty(key) {
    const dirty = await this.getDirtyKeys();
    if (!dirty.includes(key)) {
      dirty.push(key);
      await this.setDirtyKeys(dirty);
    }
  }

  async clearDirty(key) {
    const dirty = (await this.getDirtyKeys()).filter(item => item !== key);
    await this.setDirtyKeys(dirty);
  }

  async enqueue(job) {
    if (job.kind === 'history') {
      const key = `history:${job.server}:${job.dateKey}`;
      const days = await this.state.storage.get(key);
      const list = Array.isArray(days) ? days : [];
      list.push(job.snapshot);
      await this.state.storage.put(key, list);
      await this.markDirty(key);
      return { queued: true, key, count: list.length };
    }

    if (job.kind === 'leaderboard') {
      const key = `pending:${job.key}`;
      await this.state.storage.put(key, {
        data: job.data,
        ttlSeconds: job.ttlSeconds,
      });
      await this.markDirty(key);
      return { queued: true, key };
    }

    if (job.kind === 'raw') {
      const key = `pending:${job.key}`;
      await this.state.storage.put(key, {
        data: job.value,
        ttlSeconds: job.ttlSeconds,
      });
      await this.markDirty(key);
      return { queued: true, key };
    }

    return { queued: false };
  }

  async flush() {
    const blockedUntil = Number(await this.state.storage.get('blockedUntil') || 0);
    if (blockedUntil && Date.now() < blockedUntil) {
      return { flushed: 0, blockedUntil };
    }

    const dirty = await this.getDirtyKeys();
    let flushed = 0;

    for (const key of dirty) {
      try {
        if (key.startsWith('history:')) {
          const snapshots = await this.state.storage.get(key);
          if (Array.isArray(snapshots) && snapshots.length) {
            await this.env.CNR_CACHE.put(key, JSON.stringify(snapshots), {
              expirationTtl: 7 * 24 * 3600,
            });
          }
          await this.state.storage.delete(key);
          await this.clearDirty(key);
          flushed += 1;
          continue;
        }

        if (key.startsWith('pending:')) {
          const pending = await this.state.storage.get(key);
          if (pending) {
            const rawKey = key.slice('pending:'.length);
            await this.env.CNR_CACHE.put(rawKey, JSON.stringify({
              data: pending.data,
              _ts: Date.now(),
            }), {
              expirationTtl: Math.max(Number(pending.ttlSeconds || 0) * 4, 60),
            });
          }
          await this.state.storage.delete(key);
          await this.clearDirty(key);
          flushed += 1;
        }
      } catch (e) {
        if (isKvQuotaError(e)) {
          const retryUntil = nextUtcMidnightPlusBuffer();
          await this.state.storage.put('blockedUntil', retryUntil);
          return { flushed, blockedUntil: retryUntil };
        }
        console.warn('[WriteBuffer] flush failed:', e.message);
        return { flushed, error: e.message };
      }
    }

    await this.state.storage.delete('blockedUntil');
    return { flushed, blockedUntil: 0 };
  }

  async readHistory(server) {
    const dirty = await this.getDirtyKeys();
    const days = [];
    for (const key of dirty) {
      if (!key.startsWith(`history:${server}:`)) continue;
      const date = key.split(':').slice(2).join(':');
      const snapshots = await this.state.storage.get(key);
      if (Array.isArray(snapshots) && snapshots.length) {
        days.push({ date, snapshots });
      }
    }
    return days;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/enqueue') {
      const job = await request.json();
      return new Response(JSON.stringify(await this.enqueue(job)), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'POST' && url.pathname === '/flush') {
      return new Response(JSON.stringify(await this.flush()), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'GET' && url.pathname === '/history') {
      const server = url.searchParams.get('server');
      const days = server ? await this.readHistory(server) : [];
      return new Response(JSON.stringify({ days }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'GET' && url.pathname === '/state') {
      const dirty = await this.getDirtyKeys();
      const blockedUntil = Number(await this.state.storage.get('blockedUntil') || 0);
      return new Response(JSON.stringify({ dirty: dirty.length, blockedUntil }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'POST' && url.pathname === '/block') {
      const until = Number((await this.state.storage.get('blockedUntil')) || 0) || 0;
      const newUntil = nextUtcMidnightPlusBuffer();
      await this.state.storage.put('blockedUntil', newUntil);
      return new Response(JSON.stringify({ blockedUntil: newUntil }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }
}

// CF Cache API helpers — keyed by a fake URL under the worker's origin
function cfCacheUrl(key) {
  return `https://cnr-cache.internal/${encodeURIComponent(key)}`;
}
async function cfCacheGet(key) {
  try {
    const r = await caches.default.match(cfCacheUrl(key));
    if (!r) return null;
    return await r.json();
  } catch { return null; }
}
async function cfCachePut(key, data, ttlSeconds) {
  try {
    const r = new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttlSeconds}`,
      },
    });
    await caches.default.put(cfCacheUrl(key), r);
  } catch { /* CF Cache not available in all environments */ }
}

const inflight = new Map();

async function cached(env, key, ttl, url) {
  if (inflight.has(key)) return await inflight.get(key);

  const promise = (async () => {
    const now = Date.now();

    // ── Tier 1: KV ────────────────────────────────────────────────────────────
    let kvStored = null;
    try {
      kvStored = await kvGet(env.CNR_CACHE, key);
      if (kvStored && kvStored._ts && now - kvStored._ts < ttl * 1000) {
        return kvStored.data; // fresh KV hit
      }
    } catch { /* KV unavailable */ }

    // Check 429 cooldown in KV (only if KV is working)
    const cooling = kvStored !== null ? await kvGet(env.CNR_CACHE, `429:${key}`) : null;
    if (cooling) {
      if (kvStored) return kvStored.data; // serve stale KV during cooldown
    }

    // ── Tier 2: CF Cache API ──────────────────────────────────────────────────
    const cfStored = await cfCacheGet(key);
    if (cfStored && cfStored._ts && now - cfStored._ts < ttl * 1000) {
      return cfStored.data; // fresh CF Cache hit
    }

    // ── Tier 3: In-memory ─────────────────────────────────────────────────────
    const memStored = memCache.get(key);
    if (memStored && now - memStored._ts < ttl * 1000) {
      return memStored.data; // fresh memory hit
    }

    // ── Tier 4: Fetch upstream ────────────────────────────────────────────────
    let data;
    try {
      data = await fetchWithFallback(url);
    } catch (e) {
      if (e.code === 429) {
        if (ENABLE_KV_WRITES) {
          await kvPut(env.CNR_CACHE, `429:${key}`, '1', { expirationTtl: 300 });
        }
      }
      // Serve best stale data available
      if (kvStored)  return kvStored.data;
      if (cfStored)  return cfStored.data;
      if (memStored) return memStored.data;
      throw e;
    }

    // ── Write to all tiers ────────────────────────────────────────────────────
    const payload = { data, _ts: now };

    // Memory (always)
    memCache.set(key, payload);

    // CF Cache (always — zero KV ops)
    await cfCachePut(key, payload, Math.max(ttl * 4, 60));

    // KV writes are disabled to avoid exhausting the daily put quota.

    return data;
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

// =============================================================================
// Rate Limit Handling for Leaderboard API (2 reqs per 5 sec)
// =============================================================================

function getLeaderboardBackoffKey(region, stat, page) {
  return `lb:${region}:${stat}:${page}`;
}

function isLeaderboardInBackoff(key) {
  const backoffUntil = leaderboardBackoff.get(key);
  if (!backoffUntil) return false;
  if (Date.now() >= backoffUntil) {
    leaderboardBackoff.delete(key);
    return false;
  }
  return true;
}

function setLeaderboardBackoff(key, durationMs = 6000) {
  leaderboardBackoff.set(key, Date.now() + durationMs);
}

async function fetchLeaderboardWithDedup(region, stat, page, env, url, origin) {
  const key = getLeaderboardBackoffKey(region, stat, page);
  
  // Check if in backoff — serve from cache if available
  if (isLeaderboardInBackoff(key)) {
    console.log(`[RateLimit] ${key} in backoff, serving from cache`);
    try {
      const cached_data = await cached(env, key, TTL.leaderboard, url);
      return json(cached_data, TTL.leaderboard, origin);
    } catch (e) {
      // Cache miss during backoff
      return err(429, `Rate limited. Retry after ${(leaderboardBackoff.get(key) - Date.now()) / 1000}s`, origin);
    }
  }
  
  // Deduplicate inflight requests — if already fetching, return same promise
  if (leaderboardInflight.has(key)) {
    console.log(`[RateLimit] ${key} deduplicating with inflight request`);
    return leaderboardInflight.get(key);
  }
  
  // Launch new fetch
  const promise = (async () => {
    try {
      const data = await cached(
        env, key, TTL.leaderboard,
        `${LEADERBOARD_API}/${region}/${stat}/${page}`
      );
      return json(data, TTL.leaderboard, origin);
    } catch (e) {
      // Check if it's a rate limit error (429)
      if (e.status === 429 || (e.response && e.response.status === 429)) {
        console.warn(`[RateLimit] Hit 429, backing off for ${key}`);
        setLeaderboardBackoff(key, 6000); // Back off for 6 seconds
      }
      throw e;
    }
  })();
  
  leaderboardInflight.set(key, promise);
  promise.finally(() => leaderboardInflight.delete(key));
  
  return promise;
}

// Cleanup old backoff entries periodically (done per-request instead of setInterval)
function cleanupLeaderboardBackoff() {
  const now = Date.now();
  for (const [key, resetAt] of leaderboardBackoff.entries()) {
    if (now >= resetAt) {
      leaderboardBackoff.delete(key);
    }
  }
}

async function handleLeaderboard(url, env, origin) {
  const region = url.searchParams.get('region');
  const stat   = url.searchParams.get('stat');
  const page   = url.searchParams.get('page') || '1';
  if (!region || !stat) return err(400, 'Missing region or stat', origin);
  if (!/^[A-Za-z_0-9]+$/.test(stat) || !/^[A-Z]+$/.test(region) || !/^\d+$/.test(page)) {
    return err(400, 'Invalid parameters', origin);
  }
  
  return await fetchLeaderboardWithDedup(region, stat, page, env, 
    `${LEADERBOARD_API}/${region}/${stat}/${page}`, origin);
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
    const snapshots = await kvGet(env.CNR_CACHE, `history:${server}:${dateKey}`);
    if (snapshots && Array.isArray(snapshots) && snapshots.length) {
      days.push({ date: dateKey, snapshots });
    }
  }
  // Merge any buffered (not-yet-flushed) history from the Durable Object
  try {
    const buffered = await getBufferedHistory(env, server);
    if (Array.isArray(buffered) && buffered.length) {
      for (const b of buffered) {
        const exists = days.find(d => d.date === b.date);
        if (exists) {
          // append buffered snapshots after existing ones
          exists.snapshots = exists.snapshots.concat(b.snapshots || []);
        } else {
          days.push({ date: b.date, snapshots: b.snapshots || [] });
        }
      }
      // sort by date desc
      days.sort((a, b) => b.date.localeCompare(a.date));
    }
  } catch (e) {
    console.warn('history: failed to read buffered history', e.message || e);
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
const embedStatusInflight = new Map();

async function fetchEmbedStatus(env) {
  const key = 'embed-status';
  if (embedStatusInflight.has(key)) return embedStatusInflight.get(key);
  const promise = _fetchEmbedStatusImpl(env);
  embedStatusInflight.set(key, promise);
  try { return await promise; }
  finally { embedStatusInflight.delete(key); }
}

async function _fetchEmbedStatusImpl(env) {
  // Fetch servers list + all three player counts in parallel, reusing KV cache
  const [serverList, playersNA1, playersNA2, playersEU1, fivemNA1, fivemNA2, fivemEU1] = await Promise.all([
    cached(env, 'servers', TTL.servers, SERVERS_API).catch(() => []),
    cached(env, 'players:US1', TTL.players, `${PLAYERS_API}?serverId=US1`).catch(() => []),
    cached(env, 'players:US2', TTL.players, `${PLAYERS_API}?serverId=US2`).catch(() => []),
    cached(env, 'players:EU1', TTL.players, `${PLAYERS_API}?serverId=EU1`).catch(() => []),
    cached(env, 'fivem:NA1', TTL.fivem, `${FIVEM_API}/${FIVEM_CFX.NA1}`).catch(() => null),
    cached(env, 'fivem:NA2', TTL.fivem, `${FIVEM_API}/${FIVEM_CFX.NA2}`).catch(() => null),
    cached(env, 'fivem:EU1', TTL.fivem, `${FIVEM_API}/${FIVEM_CFX.EU1}`).catch(() => null),
  ]);

  const avgPingFromFivem = data => {
    const players = data?.Data?.players;
    if (!Array.isArray(players) || !players.length) return null;
    const pings = players.map(p => Number(p?.ping) || 0).filter(p => p > 0);
    if (!pings.length) return null;
    return Math.round(pings.reduce((sum, ping) => sum + ping, 0) / pings.length);
  };

  const playerCounts = {
    NA1: Array.isArray(playersNA1) ? playersNA1.length : 0,
    NA2: Array.isArray(playersNA2) ? playersNA2.length : 0,
    EU1: Array.isArray(playersEU1) ? playersEU1.length : 0,
  };

  // Build crew maps: CrewId -> crew tag name (extract first player from each crew)
  const buildCrewMap = players => {
    const map = {};
    if (Array.isArray(players)) {
      players.forEach(p => {
        const crewId = p?.CrewId;
        if (crewId && !map[crewId]) {
          // Use crew ID as shorthand for now (can be extended to fetch crew names if API provides them)
          map[crewId] = crewId.substring(0, 8).toUpperCase();
        }
      });
    }
    return map;
  };

  const crewsNA1 = buildCrewMap(playersNA1);
  const crewsNA2 = buildCrewMap(playersNA2);
  const crewsEU1 = buildCrewMap(playersEU1);

  const topPlayersFrom = (players, crewMap = {}) => {
    if (!Array.isArray(players) || !players.length) return [];
    return players
      .map(p => {
        let name = null;
        // New format: Username is directly a string
        if (typeof p?.Username === 'string') name = p.Username;
        // Old format: nested structure
        else if (p?.Username?.Username) name = p.Username.Username;
        else if (p?.Username?.username) name = p.Username.username;
        // Fallback to other possible field names
        else if (p?.name) name = p.name;
        else if (p?.Name) name = p.Name;
        else if (p?.nameTag) name = p.nameTag;
        
        if (!name) return null;
        
        // Sanitize name: remove control chars, normalize unicode, clip length
        name = name
          .replace(/[\x00-\x1F\x7F]/g, '') // remove control chars
          .normalize('NFKD') // normalize combining chars
          .substring(0, 32); // max 32 chars per name
        
        if (!name.length) return null;
        
        // Attach crew tag if available
        const crewId = p?.CrewId;
        const crewTag = crewId && crewMap[crewId] ? crewMap[crewId] : null;
        
        return { name, crewTag };
      })
      .filter(Boolean)
      .slice(0, 3);
  };


  const now    = Date.now();
  const status = {};

  for (const id of ['NA1', 'NA2', 'EU1']) {
    // serverList still uses upstream IDs (US1/US2) — match either way
    const live = Array.isArray(serverList)
      ? serverList.find(s => s.Id === id || REVERSE_SERVER_ID_MAP[s.Id] === id)
      : null;

    let restarting = false;
    let maxPlayers = SERVER_META[id].maxPlayers;

    if (live) {
      const ageSec         = (now - new Date(live.LastHeartbeatDateTime).getTime()) / 1000;
      const heartbeatFresh = ageSec < 120; // 2 min grace period covers restart window
      restarting = heartbeatFresh && playerCounts[id] === 0;
      maxPlayers = live.MaxPlayers || maxPlayers;
    }

    // Always use player count as source of truth — works even if live is null
    const online = playerCounts[id] > 0 || restarting;

    status[id] = {
      online,
      restarting,
      players:    playerCounts[id],
      maxPlayers,
      label:      SERVER_META[id].label,
      location:   SERVER_META[id].location,
      avgPing:    id === 'NA1' ? avgPingFromFivem(fivemNA1) : id === 'NA2' ? avgPingFromFivem(fivemNA2) : avgPingFromFivem(fivemEU1),
      topPlayers: id === 'NA1' ? topPlayersFrom(playersNA1, crewsNA1) : id === 'NA2' ? topPlayersFrom(playersNA2, crewsNA2) : topPlayersFrom(playersEU1, crewsEU1),
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
  const ts       = Math.floor(Date.now() / (TTL.embedImage * 1000));
  const imageUrl = `${baseUrl}/embed-image${serverId ? '/' + serverId.toLowerCase() : ''}?t=${ts}`;
  const spaTarget  = serverId
    ? `${SITE_SPA}#/${serverId.toLowerCase()}`
    : SITE_SPA;

  let title, description, themeColor;

  if (serverId && status[serverId]) {
    const s         = status[serverId];
    const state     = s.restarting ? 'Restarting' : s.online ? 'Online' : 'Offline';
    const emojiChar = s.restarting ? '🟠' : s.online ? '🟢' : '🔴';
    themeColor      = s.restarting ? COLOR_RESTART : s.online ? COLOR_ONLINE : COLOR_OFFLINE;
    title           = `CNR Tracker · ${serverId} · ${emojiChar} ${state}`;

    const others = Object.entries(status)
      .filter(([id]) => id !== serverId)
      .map(([id, sv]) => {
        const e = sv.restarting ? '🟠' : sv.online ? '🟢' : '🔴';
        return `${e} ${id}: ${sv.online ? `${sv.players}/${sv.maxPlayers}` : 'Offline'}`;
      })
      .join('\n');

    const topPlayersList = s.topPlayers && s.topPlayers.length > 0
      ? `\nTop Players:\n${s.topPlayers.map(p => `  • ${p.crewTag ? `[${p.crewTag}] ` : ''}${p.name}`).join('\n')}`
      : '';

    description = s.online
      ? `${emojiChar} ${serverId} Status: ONLINE\n${s.players}/${s.maxPlayers} Players\n\nOther Servers:\n${others}${topPlayersList}`
      : `${emojiChar} ${serverId} Status: ${state.toUpperCase()}\n\nOther Servers:\n${others}${topPlayersList}`;
  } else {
    // Overview embed — all servers
    const anyOnline    = Object.values(status).some(s => s.online);
    const totalPlayers = Object.values(status).reduce((n, s) => n + s.players, 0);
    themeColor  = anyOnline ? COLOR_ONLINE : COLOR_OFFLINE;
    title       = 'CNR Tracker · Live Server Status';
    description = Object.entries(status)
      .map(([id, s]) => {
        const e = s.restarting ? '🟠' : s.online ? '🟢' : '🔴';
        const status_text = s.restarting ? 'Restarting' : s.online ? `${s.players}/${s.maxPlayers} Online` : 'Offline';
        return `${e} ${id}: ${status_text}`;
      }).join('\n') + `\n\nTotal: ${totalPlayers} players`;
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
  // /embed-image/purge — clear server/player data from KV so next request fetches fresh
  if (new URL(request.url).pathname === '/embed-image/purge') {
    await Promise.all([
      env.CNR_CACHE.delete('servers').catch(() => {}),
      env.CNR_CACHE.delete('players:US1').catch(() => {}),
      env.CNR_CACHE.delete('players:US2').catch(() => {}),
      env.CNR_CACHE.delete('players:EU1').catch(() => {}),
    ]);
    // Also clear CF Cache and memory tiers
    ['servers','players:US1','players:US2','players:EU1'].forEach(k => {
      memCache.delete(k);
      caches.default.delete(cfCacheUrl(k)).catch(() => {});
    });
    return new Response('cache purged', { headers: { 'Content-Type': 'text/plain' } });
  }

  // Timestamp changes every 10 min — forces weserv to refetch instead of serving stale cache
  const ts     = Math.floor(Date.now() / (TTL.embedImage * 1000));
  const svgUrl = `https://cnr.ysb.one/embed-svg${serverId ? '/' + serverId.toLowerCase() : ''}?t=${ts}`;
  const pngUrl = `https://images.weserv.nl/?url=${encodeURIComponent(svgUrl)}&output=png&w=1200&h=630`;
  return Response.redirect(pngUrl, 302);
}

// =============================================================================
// Embed SVG endpoint  GET /embed-svg  or  GET /embed-svg/na1
// Returns the raw SVG — called by weserv.nl to convert to PNG
// =============================================================================
async function handleEmbedSvg(serverId, env, request) {
  // No KV caching here — SVG generation is pure CPU and fetchEmbedStatus
  // already uses the KV-cached server/player data. Caching the SVG itself
  // in KV was causing excessive read/write operations.
  // CF edge caching (s-maxage) handles repeated requests at the CDN layer.

  const status = await fetchEmbedStatus(env);
  const baseUrl = new URL(request.url).origin;
  const svg    = serverId && status[serverId]
    ? buildSingleSvg(serverId, status[serverId], baseUrl)
    : buildOverviewSvg(status, baseUrl);

  return new Response(svg, {
    headers: {
      'Content-Type':                'image/svg+xml',
      'Cache-Control':               `public, max-age=${TTL.embedImage}, s-maxage=${TTL.embedImage}`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// =============================================================================
// SVG card — single server (1200×630)
// =============================================================================
function buildSingleSvg(id, s, baseUrl) {
  const W = 1200, H = 630;
  const dotCol    = s.restarting ? COLOR_RESTART : s.online ? COLOR_ONLINE : '#52525b';
  const stateText = s.restarting ? 'RESTARTING'  : s.online ? 'ONLINE'     : 'OFFLINE';
  const pct       = s.online ? Math.min(s.players / s.maxPlayers, 1) : 0;
  const fontCss   = getSvgFontFaceCss(baseUrl);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style><![CDATA[
${fontCss}
    ]]></style>
    <pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0L0 0 0 32" fill="none" stroke="rgba(255,255,255,0.018)" stroke-width="0.5"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="${COLOR_BG}"/>
  <rect width="${W}" height="${H}" fill="url(#g)"/>

  <!-- Top accent bar, colored by status -->
  <rect x="0" y="0" width="${W}" height="6" fill="${dotCol}"/>
  <!-- Left accent line -->
  <rect x="0" y="0" width="6" height="${H}" fill="${dotCol}" opacity="0.4"/>

  <!-- Status dot (left side, bigger) -->
  <circle cx="130" cy="130" r="16" fill="${dotCol}"/>
  ${s.online ? `<circle cx="130" cy="130" r="26" fill="none" stroke="${dotCol}" stroke-width="2" opacity="0.25"/>` : ''}

  <!-- Server ID (prominent) -->
  <text x="180" y="155" font-family="${SVG_FONTS.display}"
        font-size="96" font-weight="900" letter-spacing="6" fill="${COLOR_TEXT}">${id}</text>

  <!-- Status pill (below ID) -->
  <rect x="180" y="172" width="${stateText.length * 13 + 28}" height="32" rx="6"
        fill="${dotCol}" opacity="0.14"/>
  <rect x="180" y="172" width="${stateText.length * 13 + 28}" height="32" rx="6"
        fill="none" stroke="${dotCol}" stroke-width="1"/>
  <text x="194" y="195" font-family="${SVG_FONTS.mono}" font-size="13" font-weight="700"
        letter-spacing="2" fill="${dotCol}">${stateText}</text>

  <!-- Hero player number (center, massive) -->
  <text x="600" y="420" text-anchor="middle" font-family="${SVG_FONTS.display}"
        font-size="280" font-weight="900" fill="${COLOR_TEXT}" letter-spacing="-8">${s.players}</text>

  <!-- Capacity label (below player count) -->
  <text x="600" y="470" text-anchor="middle" font-family="${SVG_FONTS.mono}" 
        font-size="28" fill="${COLOR_MUTED}">/ ${s.maxPlayers} players</text>

  <!-- Progress bar (bottom half) -->
  <rect x="76" y="520" width="1048" height="14" rx="7" fill="${COLOR_BORDER}"/>
  ${+pct > 0 ? `<rect x="76" y="520" width="${(1048 * pct).toFixed(1)}" height="14" rx="7" fill="${dotCol}"/>` : ''}

  <!-- Watermark logo (top-right) -->
  <text x="${W - 72}" y="80" text-anchor="end" font-family="${SVG_FONTS.display}"
        font-size="32" font-weight="900" letter-spacing="3"
        fill="${COLOR_TEXT}" opacity="0.25">CNR<tspan fill="${COLOR_ACCENT}">TRACKER</tspan></text>

  <!-- Footer -->
  <text x="76" y="${H - 24}" font-family="${SVG_FONTS.mono}" font-size="12" letter-spacing="2"
        fill="${COLOR_MUTED}">LIVE · GTA CRIME AND ROBBERY</text>
  <text x="${W - 72}" y="${H - 24}" text-anchor="end" font-family="${SVG_FONTS.mono}"
        font-size="12" letter-spacing="2" fill="${COLOR_MUTED}">gtacnr.net · fivem.net</text>
</svg>`;
}

// =============================================================================
// SVG card — all servers overview (1200×630)
// =============================================================================
function buildOverviewSvg(status, baseUrl) {
  const W = 1200, H = 630;
  const anyOnline    = Object.values(status).some(s => s.online);
  const totalPlayers = Object.values(status).reduce((n, s) => n + s.players, 0);
  const accentColor  = anyOnline ? COLOR_ONLINE : COLOR_OFFLINE;
  const fontCss      = getSvgFontFaceCss(baseUrl);

  // Three server cards: x positions 72, 432, 792  (width 300 each)
  const cards = Object.entries(status).map(([id, s], i) => {
    const cx     = 72 + i * 372;
    const dotCol = s.restarting ? COLOR_RESTART : s.online ? COLOR_ONLINE : '#52525b';
    const pct    = s.online ? Math.min(s.players / s.maxPlayers, 1) : 0;
    const barW   = (264 * pct).toFixed(1);
    const state  = s.restarting ? 'RESTARTING' : s.online ? 'ONLINE' : 'OFFLINE';
    const topLabel = s.online ? `${s.players}/${s.maxPlayers}` : 'offline';

    return `
    <!-- ── ${id} card ── -->
    <rect x="${cx}" y="214" width="332" height="334" rx="10"
          fill="${COLOR_SURFACE}" stroke="${COLOR_BORDER}" stroke-width="0.5"/>
    <!-- Top accent on card -->
    <rect x="${cx}" y="214" width="332" height="4" rx="2" fill="${dotCol}"/>

    <!-- Status dot + Server ID -->
    <circle cx="${cx + 26}" cy="${214 + 40}" r="6" fill="${dotCol}"/>
    <text x="${cx + 42}" y="${214 + 46}"
      font-family="${SVG_FONTS.display}" font-size="22" font-weight="900"
      letter-spacing="2" fill="${COLOR_TEXT}">${id}</text>

    <!-- State label -->
    <text x="${cx + 26}" y="${214 + 74}"
      font-family="${SVG_FONTS.mono}" font-size="10" letter-spacing="3"
          fill="${dotCol}">${state}</text>

    <!-- Region -->
    <text x="${cx + 26}" y="${214 + 100}"
      font-family="${SVG_FONTS.mono}" font-size="10" letter-spacing="1"
          fill="${COLOR_MUTED}">${s.label.toUpperCase()}</text>

    <!-- Location -->
    <text x="${cx + 26}" y="${214 + 118}"
      font-family="${SVG_FONTS.mono}" font-size="10" letter-spacing="1"
      fill="${COLOR_MUTED}">${s.location}</text>

    <!-- Player count -->
    <text x="${cx + 26}" y="${214 + 198}"
      font-family="${SVG_FONTS.display}" font-size="92" font-weight="900"
          fill="${COLOR_TEXT}">${s.players}</text>
    <text x="${cx + 26}" y="${214 + 228}"
      font-family="${SVG_FONTS.mono}" font-size="14" fill="${COLOR_MUTED}">${topLabel}</text>

    <!-- Progress bar -->
    <rect x="${cx + 26}" y="${214 + 254}" width="264" height="7" rx="3.5"
          fill="${COLOR_BORDER}"/>
    ${+barW > 0 ? `<rect x="${cx + 26}" y="${214 + 254}" width="${barW}" height="7" rx="3.5"
          fill="${dotCol}"/>` : ''}

    <!-- Fill % -->
    ${s.online ? `<text x="${cx + 26}" y="${214 + 286}"
      font-family="${SVG_FONTS.mono}" font-size="11" fill="${COLOR_MUTED}"
          >${Math.round(pct * 100)}% full</text>` : ''}
    `;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style><![CDATA[
${fontCss}
    ]]></style>
    <pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0L0 0 0 32" fill="none" stroke="rgba(255,255,255,0.018)" stroke-width="0.5"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="${COLOR_BG}"/>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="0" y="0" width="${W}" height="4" fill="${accentColor}"/>

    <!-- Header -->
    <text x="72" y="112" font-family="${SVG_FONTS.display}"
      font-size="62" font-weight="900" letter-spacing="2"
      fill="${COLOR_TEXT}">CNR<tspan fill="${COLOR_ACCENT}">TRACKER</tspan></text>
    <text x="76" y="140" font-family="${SVG_FONTS.mono}" font-size="12" letter-spacing="3"
      fill="${COLOR_MUTED}">LIVE OVERVIEW · PLAYERS GLOBALLY · ${totalPlayers} PLAYERS</text>

  ${cards}

  <!-- Footer -->
    <text x="72" y="${H - 24}" font-family="${SVG_FONTS.mono}" font-size="11" letter-spacing="2"
        fill="${COLOR_MUTED}">GTA CRIME AND ROBBERY</text>
    <text x="${W - 72}" y="${H - 24}" text-anchor="end" font-family="${SVG_FONTS.mono}"
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

  // Periodic cleanup of expired backoffs (do this occasionally per-request)
  if (Math.random() < 0.1) cleanupLeaderboardBackoff(); // ~10% of requests

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (request.method !== 'GET') {
    return err(405, 'Method not allowed', origin);
  }

  // ── Static files: sw.js, shared-worker.js, manifest.json ────────────────
  if (url.pathname === '/sw.js') {
    const text = await (await fetch(new URL('./sw.js', import.meta.url))).text();
    return new Response(text, {
      headers: {
        'Content-Type':  'application/javascript',
        'Cache-Control': 'no-cache', // always fetch latest SW
        'Service-Worker-Allowed': '/',
      },
    });
  }
  if (url.pathname === '/shared-worker.js') {
    return new Response(SHARED_WORKER_JS, {
      headers: {
        'Content-Type':  'application/javascript',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }
  if (url.pathname === '/manifest.json') {
    return new Response(manifestJson, {
      headers: {
        'Content-Type':  'application/manifest+json',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }
  if (url.pathname === '/favicon.svg') {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="CNR Tracker">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fbbf24"/>
      <stop offset="1" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#0a0a0b"/>
  <circle cx="32" cy="32" r="21" fill="url(#g)"/>
  <path d="M21 25h22v6H35v18h-6V31H21z" fill="#0a0a0b"/>
</svg>`;
    return new Response(svg, {
      headers: {
        'Content-Type':  'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }
  if (url.pathname === '/fonts/fonts.css') {
    return new Response(`
@font-face {
  font-family: 'Bebas Neue';
  src: url('/fonts/BebasNeue.woff2') format('woff2');
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: 'IBM Plex Sans';
  src: url('/fonts/IBMPlexSans.woff2') format('woff2');
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
}

@font-face {
  font-family: 'JetBrains Mono';
  src: url('/fonts/JetBrainsMono.woff2') format('woff2');
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
}
`.trimStart(), {
      headers: {
        'Content-Type':  'text/css; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  if (url.pathname === '/fonts/BebasNeue.woff2') return fontResponse(bebasNeueFont);
  if (url.pathname === '/fonts/IBMPlexSans.woff2') return fontResponse(ibmPlexSansFont);
  if (url.pathname === '/fonts/JetBrainsMono.woff2') return fontResponse(jetBrainsMonoFont);

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

  // ── Embed SVG endpoint (fetched by weserv to convert to PNG) ──────────────
  const embedSvgMatch = url.pathname.match(/^\/embed-svg\/?([a-z0-9]*)$/i);
  if (embedSvgMatch) {
    const raw      = (embedSvgMatch[1] || '').toUpperCase();
    const serverId = SERVER_META[raw] ? raw : null;
    return handleEmbedSvg(serverId, env, request);
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
// Scheduled handler — snapshots history + preloads enrichment leaderboard data
// =============================================================================
async function handleScheduled(env) {
  try {
    // Add jitter (±30 seconds) to prevent thundering herd exactly at cron time
    const jitter = Math.random() * 60000 - 30000; // -30s to +30s
    if (jitter > 0) await new Promise(r => setTimeout(r, jitter));
    
    const data = await fetchWithFallback(SERVERS_API);
    if (!Array.isArray(data)) return;
    const now     = new Date();
    const dateKey = now.toISOString().split('T')[0];
    const timeKey = now.toISOString();

    // ── History snapshots ──────────────────────────────────────────────────────
    // Batch all server updates together and enqueue into the Durable Object
    await Promise.all(data.map(async s => {
      const localId = REVERSE_SERVER_ID_MAP[s.Id];
      if (!localId) return;
      const snapshot = { t: timeKey, players: s.Players, queue: s.QueuedPlayers, max: s.MaxPlayers };
      // Try to buffer; on failure we fallback to CF/memory only (no KV writes)
      const buffered = await bufferHistorySnapshot(env, localId, dateKey, snapshot).catch(() => false);
      if (!buffered) {
        // Best-effort: keep in-memory CF cache so reads still see recent data
        const histKey = `history:${localId}:${dateKey}`;
        let day = await cfCacheGet(histKey) || [];
        if (!Array.isArray(day)) day = [];
        day.push(snapshot);
        await cfCachePut(histKey, { data: day, _ts: Date.now() }, 7 * 24 * 3600);
      }
    }));

    // ── Preload enrichment leaderboard data ────────────────────────────────────
    // Keeps page 1 of the most-used leaderboard stats warm in KV so the first
    // visitor each hour doesn't have to wait for the upstream fetch.
    const enrichStats = ['net_worth', 'crimes_committed', 'arrests'];
    const enrichRegions = ['NA', 'EU'];
    await Promise.all(
      enrichRegions.flatMap(region =>
        enrichStats.map(async stat => {
          const key = `lb:${region}:${stat}:1`;
          const stored = await kvGet(env.CNR_CACHE, key);
          // Only refresh if expired or missing
          if (!stored || !stored._ts || Date.now() - stored._ts > TTL.leaderboard * 1000) {
            try {
              const fresh = await fetchWithFallback(`${LEADERBOARD_API}/${region}/${stat}/1`);
              // Buffer leaderboard writes when possible; otherwise write to CF cache only
              const buffered = await bufferLeaderboardWarm(env, key, fresh, Math.max(TTL.leaderboard * 4, 60)).catch(() => false);
              if (!buffered) {
                await cfCachePut(key, { data: fresh, _ts: Date.now() }, Math.max(TTL.leaderboard * 4, 60));
              }
            } catch (e) {
              console.warn(`cron: enrichment preload failed for ${region}:${stat}`, e.message);
            }
          }
        })
      )
    );
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

// Durable Object class is exported where it's declared above.
