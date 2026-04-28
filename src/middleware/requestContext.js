const { randomUUID } = require("crypto");

function requestContext(req, res, next) {
  req.id = randomUUID();
  req.startTime = Date.now();
  res.setHeader("x-request-id", req.id);

  res.on("finish", () => {
    const ms = Date.now() - req.startTime;
    const user = req.user?.id || "anonymous";
    const provider = res.locals.aiProvider || "n/a";
    console.log(`[REQ] id=${req.id} user=${user} route=${req.method} ${req.originalUrl} status=${res.statusCode} provider=${provider} time=${ms}ms`);
  });

  next();
}

module.exports = { requestContext };
