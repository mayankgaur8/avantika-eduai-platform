const jwt = require("jsonwebtoken");
const { query } = require("../db/client");
const { syncUserPlanState } = require("../db/billingQueries");

const JWT_SECRET = process.env.JWT_SECRET?.trim() ||
  (process.env.NODE_ENV === "production" ? "" : "local_dev_secret");

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production environment.");
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const currentPlan = await syncUserPlanState(decoded.id);
    const userResult = await query(
      `SELECT id, email, role, plan FROM users WHERE id = $1`,
      [decoded.id]
    );
    if (!userResult.rows.length) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    req.user = {
      ...decoded,
      ...userResult.rows[0],
      plan: currentPlan || userResult.rows[0].plan,
    };
    next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, error: "Admin access required" });
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware, JWT_SECRET };
