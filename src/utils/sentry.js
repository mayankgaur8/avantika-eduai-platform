let Sentry = null;
let initialized = false;

function getSentry() {
  if (Sentry !== null) {
    return Sentry;
  }

  try {
    Sentry = require("@sentry/node");
  } catch {
    Sentry = null;
  }

  return Sentry;
}

function initSentry() {
  const dsn = process.env.SENTRY_DSN?.trim();
  const sentry = getSentry();
  if (!dsn || !sentry || initialized) {
    return sentry;
  }

  sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  });
  initialized = true;
  return sentry;
}

function captureException(error, context = {}) {
  const sentry = getSentry();
  if (!sentry || !process.env.SENTRY_DSN?.trim()) {
    return;
  }

  sentry.withScope((scope) => {
    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => scope.setTag(key, value));
    }
    if (context.user) {
      scope.setUser(context.user);
    }
    if (context.extra) {
      scope.setExtras(context.extra);
    }
    sentry.captureException(error);
  });
}

module.exports = { initSentry, captureException, getSentry };