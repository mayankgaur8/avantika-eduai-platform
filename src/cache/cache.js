/**
 * Async cache abstraction.
 *
 * Backed by an in-memory Map by default.
 * To upgrade to Redis: set REDIS_URL in env + `npm install ioredis`,
 * then uncomment the Redis block below — no other code changes needed.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 min

// ── In-memory backend ────────────────────────────────────────────────────────

const store = new Map();

// Periodic eviction (every 5 min) to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of store) {
    if (item.expiresAt < now) store.delete(key);
  }
}, 5 * 60 * 1000).unref();

function memGet(key) {
  const item = store.get(key);
  if (!item) return null;
  if (item.expiresAt < Date.now()) { store.delete(key); return null; }
  return item.value;
}

function memSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function memDel(key) { store.delete(key); }

// ── Public API ───────────────────────────────────────────────────────────────

async function get(key) {
  try {
    return memGet(key);
  } catch { return null; }
}

async function set(key, value, ttlMs = DEFAULT_TTL_MS) {
  try {
    memSet(key, value, ttlMs);
  } catch { /* non-fatal */ }
}

async function del(key) {
  try {
    memDel(key);
  } catch { /* non-fatal */ }
}

function size() { return store.size; }

module.exports = { get, set, del, size };

/*
 * ── Redis upgrade path (when ready) ────────────────────────────────────────
 * 1. npm install ioredis
 * 2. Set REDIS_URL=rediss://<host>:<port> in Azure App Settings
 * 3. Replace the Public API block above with:
 *
 * const Redis = require("ioredis");
 * let redis = null;
 * try {
 *   if (process.env.REDIS_URL) {
 *     redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
 *     redis.on("error", err => { console.error("[Redis]", err.message); redis = null; });
 *     await redis.connect();
 *   }
 * } catch {}
 *
 * async function get(key) {
 *   try {
 *     if (redis) { const v = await redis.get(key); return v ? JSON.parse(v) : null; }
 *   } catch {}
 *   return memGet(key);
 * }
 * async function set(key, value, ttlMs = DEFAULT_TTL_MS) {
 *   try {
 *     if (redis) { await redis.set(key, JSON.stringify(value), "PX", ttlMs); return; }
 *   } catch {}
 *   memSet(key, value, ttlMs);
 * }
 * async function del(key) {
 *   try { if (redis) { await redis.del(key); return; } } catch {}
 *   memDel(key);
 * }
 */
