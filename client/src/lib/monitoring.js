import * as Sentry from "@sentry/react";

let initialized = false;

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || initialized) {
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0.1),
  });
  initialized = true;
}

export function captureClientError(error, context = {}) {
  if (!import.meta.env.VITE_SENTRY_DSN) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => scope.setTag(key, value));
    }
    if (context.extra) {
      Object.entries(context.extra).forEach(([key, value]) => scope.setExtra(key, value));
    }
    Sentry.captureException(error);
  });
}

export function captureApiFailure(error, normalized) {
  captureClientError(error, {
    tags: {
      type: "api_failure",
      code: normalized?.code || "UNKNOWN",
      status: normalized?.status ? String(normalized.status) : "unknown",
    },
    extra: {
      requestId: normalized?.requestId,
      details: normalized?.details,
      message: normalized?.message,
      url: error.config?.url,
      method: error.config?.method,
    },
  });
}