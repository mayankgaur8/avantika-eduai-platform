function sendSuccess(res, data, status = 200, extra = {}) {
  return res.status(status).json({ success: true, data, ...extra });
}

function sendError(res, {
  status = 500,
  code = "INTERNAL_ERROR",
  message = "Something went wrong.",
  details,
  requestId,
}) {
  const body = { success: false, code, message };
  if (details) body.details = details;
  if (requestId) body.requestId = requestId;
  return res.status(status).json(body);
}

module.exports = { sendSuccess, sendError };
