/**
 * Async cache abstraction.
 *
 * Redis is used when REDIS_URL is configured and ioredis is installed.
 * Any Redis failure falls back to the in-memory backend automatically.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const cleanupIntervalMs = 5 * 60 * 1000;

const store = new Map();

let RedisCtor = null;
let redisClient = null;
let redisInitPromise = null;
let redisUnavailableReason = null;
let redisErrorLogged = false;

setInterval(() => {
  const now = Date.now();
  for (const [key, item] of store) {
    if (item.expiresAt <= now) {
      store.delete(key);
    }
  }
}, cleanupIntervalMs).unref();

function memGetRecord(key) {
  const item = store.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return item;
}

function memGet(key) {
  return memGetRecord(key)?.value ?? null;
}

function memSet(key, value, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function memDel(key) {
  store.delete(key);
}

function memIncr(key, ttlMs = DEFAULT_TTL_MS, incrementBy = 1) {
  const item = memGetRecord(key);
  const currentValue = Number(item?.value || 0);
  const nextValue = currentValue + incrementBy;
  const expiresAt = item?.expiresAt || Date.now() + ttlMs;
  store.set(key, { value: nextValue, expiresAt });
  return { value: nextValue, expiresAt };
}

function loadRedisCtor() {
  if (RedisCtor !== null || redisUnavailableReason) {
    return RedisCtor;
  }

  try {
    RedisCtor = require("ioredis");
  } catch (err) {
    redisUnavailableReason = err.message;
  }

  return RedisCtor;
}

function logRedisError(err) {
  if (redisErrorLogged) return;
  redisErrorLogged = true;
  console.warn(`[Cache] Redis unavailable, falling back to memory: ${err.message}`);
}

async function getRedisClient() {
  if (!process.env.REDIS_URL?.trim()) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  if (redisInitPromise) {
    return redisInitPromise;
  }

  const Redis = loadRedisCtor();
  if (!Redis) {
    return null;
  }

  redisInitPromise = (async () => {
    try {
      const client = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
      });

      client.on("error", (err) => {
        logRedisError(err);
      });

      await client.connect();
      redisClient = client;
      return redisClient;
    } catch (err) {
      logRedisError(err);
      redisClient = null;
      return null;
    } finally {
      redisInitPromise = null;
    }
  })();

  return redisInitPromise;
}

async function get(key) {
  try {
    const redis = await getRedisClient();
    if (redis) {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    }
  } catch (err) {
    logRedisError(err);
  }

  try {
    return memGet(key);
  } catch {
    return null;
  }
}

async function set(key, value, ttlMs = DEFAULT_TTL_MS) {
  try {
    const redis = await getRedisClient();
    if (redis) {
      await redis.set(key, JSON.stringify(value), "PX", ttlMs);
      return;
    }
  } catch (err) {
    logRedisError(err);
  }

  try {
    memSet(key, value, ttlMs);
  } catch {
    // non-fatal cache write failure
  }
}

async function del(key) {
  try {
    const redis = await getRedisClient();
    if (redis) {
      await redis.del(key);
      return;
    }
  } catch (err) {
    logRedisError(err);
  }

  try {
    memDel(key);
  } catch {
    // non-fatal cache delete failure
  }
}

async function incr(key, ttlMs = DEFAULT_TTL_MS, incrementBy = 1) {
  try {
    const redis = await getRedisClient();
    if (redis) {
      const multi = redis.multi();
      multi.incrby(key, incrementBy);
      multi.pttl(key);
      const [, ttlResult] = await multi.exec();
      const currentTtlMs = Number(ttlResult?.[1] ?? -1);
      if (currentTtlMs < 0) {
        await redis.pexpire(key, ttlMs);
      }
      const nextValue = Number(await redis.get(key));
      return {
        value: nextValue,
        expiresAt: Date.now() + (currentTtlMs > 0 ? currentTtlMs : ttlMs),
      };
    }
  } catch (err) {
    logRedisError(err);
  }

  return memIncr(key, ttlMs, incrementBy);
}

function size() {
  return store.size;
}

function getStatus() {
  return {
    backend: redisClient ? "redis" : "memory",
    redisConfigured: Boolean(process.env.REDIS_URL?.trim()),
    redisAvailable: Boolean(redisClient),
    fallbackReason: redisUnavailableReason,
    memoryKeys: store.size,
  };
}

module.exports = { get, set, del, incr, size, getStatus };
