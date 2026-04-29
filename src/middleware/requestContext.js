const { randomUUID } = require("crypto");

function requestContext(req, res, next) {
  req.id = randomUUID();
  req.startTime = Date.now();
  res.setHeader("x-request-id", req.id);

  res.on("finish", () => {
    const ms = Date.now() - req.startTime;
    const payload = {
      level: res.statusCode >= 500 ? "error" : "info",
      event: "http_request",
      request_id: req.id,
      user_id: req.user?.id || "anonymous",
      endpoint: `${req.method} ${req.originalUrl}`,
      status: res.statusCode,
      ai_provider: res.locals.aiProvider || null,
      ai_latency_ms: res.locals.aiLatencyMs || null,
      latency_ms: ms,
      error_reason: res.locals.errorReason || null,
    };

    console.log(JSON.stringify(payload));
  });

  next();
}

module.exports = { requestContext };
