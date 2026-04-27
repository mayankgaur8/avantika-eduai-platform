const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../db/client");
const { authMiddleware, JWT_SECRET } = require("../middleware/auth");

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
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, plan: user.plan }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, school_name: user.school_name, role: user.role, plan: user.plan } });
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

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, plan: user.plan }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      success: true,
      token,
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
      "SELECT id, name, email, school_name, role, plan, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch user" });
  }
});

module.exports = router;
