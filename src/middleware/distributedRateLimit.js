const crypto = require("crypto");
const cache = require("../cache/cache");
const { sendError } = require("../utils/apiResponse");

function hashKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function defaultMessage(windowMs) {
  const seconds = Math.ceil(windowMs / 1000);
  return `Too many requests. Retry after ${seconds}s.`;
}

function distributedRateLimit({
  windowMs,
  max,
  prefix = "rate-limit",
  skip,
  keyGenerator,
  message,
  code = "RATE_LIMITED",
}) {
  if (!Number.isFinite(windowMs) || !Number.isFinite(max)) {
    throw new Error("distributedRateLimit requires numeric windowMs and max");
  }

  return async function rateLimitMiddleware(req, res, next) {
    try {
      if (skip?.(req)) {
        return next();
      }

      const rawIdentity = keyGenerator
        ? await keyGenerator(req)
        : req.user?.id || req.headers.authorization || req.ip || "anonymous";

      const key = `${prefix}:${hashKey(rawIdentity)}`;
      const { value, expiresAt } = await cache.incr(key, windowMs, 1);
      const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));

      res.setHeader("x-ratelimit-limit", String(max));
      res.setHeader("x-ratelimit-remaining", String(Math.max(0, max - value)));
      res.setHeader("x-ratelimit-reset", new Date(expiresAt).toISOString());

      if (value > max) {
        res.setHeader("retry-after", String(retryAfterSeconds));
        res.locals.errorReason = code;
        return sendError(res, {
          status: 429,
          code,
          message: message || defaultMessage(windowMs),
          requestId: req.id,
          details: { retryAfterSeconds },
        });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { distributedRateLimit };