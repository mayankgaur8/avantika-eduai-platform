const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { query } = require("../db/client");
const { authMiddleware, JWT_SECRET } = require("../middleware/auth");

const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET?.trim() || JWT_SECRET + "_refresh";
const ACCESS_TOKEN_TTL = "1h";
const REFRESH_TOKEN_TTL_DAYS = 30;

function signAccessToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, plan: user.plan }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

function signRefreshToken(user) {
  return jwt.sign({ id: user.id, type: "refresh" }, REFRESH_SECRET, { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` });
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function storeRefreshToken(userId, rawToken) {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (token_hash) DO NOTHING`,
    [userId, hashToken(rawToken), expiresAt]
  );
}

const router = express.Router();

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, school_name, role = "teacher" } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: "Name, email, and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
    }

    // Check if email already exists
    const existing = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: "Email already registered" });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const validRole = ["teacher", "institute"].includes(role) ? role : "teacher";

    const result = await query(
      `INSERT INTO users (name, email, password_hash, school_name, role, plan)
       VALUES ($1, $2, $3, $4, $5, 'free')
       RETURNING id, name, email, school_name, role, plan, created_at`,
      [name.trim(), email.toLowerCase().trim(), password_hash, school_name?.trim() || null, validRole]
    );

    const user = result.rows[0];
    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    try { await storeRefreshToken(user.id, refreshToken); } catch (_) { /* non-fatal */ }

    res.status(201).json({ success: true, token, refreshToken, user: { id: user.id, name: user.name, email: user.email, school_name: user.school_name, role: user.role, plan: user.plan } });
  } catch (err) {
    console.error("[Signup Error]", err.code, err.message);
    const msg = err.code === "ECONNREFUSED" ? "Database unreachable — check DATABASE_URL"
      : err.code === "3D000" ? "Database does not exist — run npm run db:init"
      : err.code === "28P01" ? "Database auth failed — check DATABASE_URL credentials"
      : "Signup failed";
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    const result = await query(
      "SELECT id, name, email, password_hash, school_name, role, plan FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    try {
      await storeRefreshToken(user.id, refreshToken);
      await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
    } catch (_) { /* non-fatal */ }

    res.json({
      success: true,
      token,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, school_name: user.school_name, role: user.role, plan: user.plan },
    });
  } catch (err) {
    console.error("[Login Error]", err.code, err.message);
    const msg = err.code === "ECONNREFUSED" ? "Database unreachable — check DATABASE_URL"
      : "Login failed";
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, school_name, role, plan, created_at,
              onboarding_completed, goal, level, weak_areas, target_exam_date
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch user" });
  }
});

// PATCH /api/auth/profile — save onboarding preferences
router.patch("/profile", authMiddleware, async (req, res) => {
  const { goal, level, weak_areas, target_exam_date } = req.body;

  const VALID_GOALS = ["CAT", "School", "Teacher"];
  const VALID_LEVELS = ["Beginner", "Intermediate", "Advanced"];
  const VALID_AREAS = ["QA", "LRDI", "VARC"];

  if (goal && !VALID_GOALS.includes(goal)) {
    return res.status(400).json({ success: false, error: "Invalid goal" });
  }
  if (level && !VALID_LEVELS.includes(level)) {
    return res.status(400).json({ success: false, error: "Invalid level" });
  }
  const filteredAreas = Array.isArray(weak_areas)
    ? weak_areas.filter(a => VALID_AREAS.includes(a))
    : null;

  try {
    const result = await query(
      `UPDATE users
       SET goal = COALESCE($1, goal),
           level = COALESCE($2, level),
           weak_areas = COALESCE($3, weak_areas),
           target_exam_date = COALESCE($4::DATE, target_exam_date),
           onboarding_completed = TRUE,
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, email, school_name, role, plan,
                 onboarding_completed, goal, level, weak_areas, target_exam_date`,
      [goal || null, level || null, filteredAreas, target_exam_date || null, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error("[PATCH /profile]", err.message);
    res.status(500).json({ success: false, error: "Profile update failed" });
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ success: false, error: "Refresh token required" });

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, REFRESH_SECRET);
  } catch {
    return res.status(401).json({ success: false, error: "Invalid or expired refresh token" });
  }

  if (decoded.type !== "refresh") {
    return res.status(401).json({ success: false, error: "Invalid token type" });
  }

  try {
    const tokenHash = hashToken(refreshToken);
    const stored = await query(
      "SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()",
      [tokenHash]
    );
    if (!stored.rows.length) {
      return res.status(401).json({ success: false, error: "Refresh token revoked or expired" });
    }

    const userResult = await query(
      "SELECT id, email, role, plan FROM users WHERE id = $1",
      [decoded.id]
    );
    if (!userResult.rows.length) {
      return res.status(401).json({ success: false, error: "User not found" });
    }

    const user = userResult.rows[0];

    // Rotate: revoke old, issue new
    await query("UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1", [tokenHash]);
    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);
    await storeRefreshToken(user.id, newRefreshToken);

    res.json({ success: true, token: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error("[Auth/Refresh]", err.message);
    res.status(500).json({ success: false, error: "Token refresh failed" });
  }
});

// POST /api/auth/logout
router.post("/logout", authMiddleware, async (req, res) => {
  const { refreshToken } = req.body;
  try {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query("UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1", [tokenHash]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: "Logout failed" });
  }
});

module.exports = router;
