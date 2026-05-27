// =============================================================================
// CNR Tracker — Shared Worker
// All tabs share one polling loop instead of each polling independently.
// Tabs track their own selected server independently.
// =============================================================================

const API_BASE   = (typeof location !== 'undefined' && location.origin) ? location.origin : 'https://cnr.ysb.one';
const DIRECT_API = 'https://api.gtacnr.net/cnr';
const FIVEM_API  = 'https://servers-frontend.fivem.net/api/servers/single';

const FIVEM_CFX = { NA1: 'a6aope', NA2: 'zlvypp', EU1: 'kx98er' };
const API_IDS   = { NA1: 'US1', NA2: 'US2', EU1: 'EU1' };

const POLL_INTERVAL = 30000; // 30s

// Connected ports (one per tab)
const ports = new Set();

// Shared data store
const store = {
  servers:     null,
  players:     { NA1: null, NA2: null, EU1: null },
  fivem:       { NA1: null, NA2: null, EU1: null },
  lastFetch:   { servers: 0, NA1: 0, NA2: 0, EU1: 0 },
  errors:      {},
};

// =============================================================================
// Connection handler
// =============================================================================
self.onconnect = event => {
  const port = event.ports[0];
  ports.add(port);

  port.onmessage = e => handleMessage(port, e.data);

  port.onclose = () => ports.delete(port);

  // Send current data immediately to new tab
  port.postMessage({ type: 'INIT', data: getSnapshot() });

  port.start();
};

// =============================================================================
// Message handler
// =============================================================================
function handleMessage(port, msg) {
  switch (msg.type) {
    case 'FETCH_SERVER':
      // Tab is switching to a server — ensure its data is fresh
      ensureServerData(msg.server);
      break;
    case 'FORCE_REFRESH':
      fetchAll();
      break;
  }
}

// =============================================================================
// Broadcast to all connected tabs
// =============================================================================
function broadcast(msg) {
  for (const port of ports) {
    try { port.postMessage(msg); } catch (e) { ports.delete(port); }
  }
}

// =============================================================================
// Fetch helpers
// =============================================================================
async function tryFetch(url, timeout = 6000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchWithFallback(directUrl, workerPath) {
  // Try direct first
  try { return await tryFetch(directUrl, 5000); } catch (e) {}
  // Try worker
  try { return await tryFetch(`${API_BASE}${workerPath}`, 8000); } catch (e) {}
  throw new Error('All sources failed');
}

// =============================================================================
// Data fetchers
// =============================================================================
async function fetchServers() {
  try {
    const raw = await fetchWithFallback(
      `${DIRECT_API}/servers`,
      '/api/servers'
    );
    const data = Array.isArray(raw)
      ? raw.map(s => ({ ...s, Id: { US1: 'NA1', US2: 'NA2', EU1: 'EU1' }[s.Id] || s.Id }))
      : raw;
    store.servers   = data;
    store.lastFetch.servers = Date.now();
    store.errors.servers    = null;
    broadcast({ type: 'SERVERS_UPDATE', data });
  } catch (e) {
    store.errors.servers = e.message;
    broadcast({ type: 'SERVERS_ERROR', error: e.message });
  }
}

async function fetchPlayers(server) {
  const apiId = API_IDS[server];
  try {
    const data = await fetchWithFallback(
      `${DIRECT_API}/players?serverId=${apiId}`,
      `/api/players?server=${server}`
    );
    store.players[server]   = data;
    store.lastFetch[server] = Date.now();
    store.errors[server]    = null;
    broadcast({ type: 'PLAYERS_UPDATE', server, data });
  } catch (e) {
    store.errors[server] = e.message;
    broadcast({ type: 'PLAYERS_ERROR', server, error: e.message });
  }
}

async function fetchFivem(server) {
  const cfx = FIVEM_CFX[server];
  try {
    const data = await tryFetch(`${FIVEM_API}/${cfx}`, 5000)
      .catch(() => tryFetch(`${API_BASE}/api/fivem?server=${server}`, 8000));
    store.fivem[server] = data;
    broadcast({ type: 'FIVEM_UPDATE', server, data });
  } catch (e) {
    broadcast({ type: 'FIVEM_ERROR', server, error: e.message });
  }
}

async function ensureServerData(server) {
  const age = Date.now() - (store.lastFetch[server] || 0);
  if (age > POLL_INTERVAL) {
    await Promise.all([fetchPlayers(server), fetchFivem(server)]);
  }
}

async function fetchAll() {
  await Promise.all([
    fetchServers(),
    fetchPlayers('NA1'),
    fetchPlayers('NA2'),
    fetchPlayers('EU1'),
    fetchFivem('NA1'),
    fetchFivem('NA2'),
    fetchFivem('EU1'),
  ]);
}

function getSnapshot() {
  return {
    servers: store.servers,
    players: store.players,
    fivem:   store.fivem,
    errors:  store.errors,
  };
}

// =============================================================================
// Polling loop
// =============================================================================
async function poll() {
  if (ports.size > 0) {
    await fetchAll();
  }
  setTimeout(poll, POLL_INTERVAL);
}

// Start polling
poll();