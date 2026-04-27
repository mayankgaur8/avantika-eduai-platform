require("dotenv").config();

// ── Production env guard ──────────────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const required = ["DATABASE_URL", "JWT_SECRET", "CLIENT_URL"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("[FATAL] Missing required env vars:", missing.join(", "));
    process.exit(1);
  }
}

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const authRouter = require("./routes/auth");
const quizRouter = require("./routes/quiz");
const assignmentRouter = require("./routes/assignment");
const papersRouter = require("./routes/papers");
const billingRouter = require("./routes/billing");
const paymentRouter = require("./routes/payment");
const adminRouter = require("./routes/admin");
const { authMiddleware } = require("./middleware/auth");
const { query } = require("./db/client");
const { getAIConfig } = require("./claude/client");

const app = express();
app.set("trust proxy", 1); // Required for express-rate-limit behind Azure/nginx proxy
const PORT = process.env.PORT || 3000;

const rawClientUrls =
  process.env.CLIENT_URL ||
  process.env.CORS_ORIGIN ||
  process.env["cors.origin"] ||
  "";

const allowedOrigins = rawClientUrls
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 && process.env.NODE_ENV !== "production") {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS origin not allowed"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please wait and try again." },
});
app.use("/api", limiter);

// ── Request logger (dev) ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`, JSON.stringify(req.body));
    next();
  });
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "Avantika EduAI API", version: "2.0.0" });
});

app.use("/api/auth", authRouter);
app.use("/api/quiz", authMiddleware, quizRouter);
app.use("/api/assignment", assignmentRouter);
app.use("/api/papers", papersRouter);
app.use("/api/billing", billingRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/admin", adminRouter);

if (process.env.NODE_ENV !== "production") {
  app.get("/api/debug/routes", (req, res) => {
    res.json({
      routes: app._router.stack
        .filter((r) => r.route)
        .map((r) => r.route.path),
    });
  });

  app.get("/api/debug/ai-config", (req, res) => {
    res.json(getAIConfig());
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("[Unhandled Error]", err);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ── Start ────────────────────────────────────────────────────────────────────

async function ensureTables() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID        NOT NULL,
        subject     TEXT        NOT NULL,
        topic       TEXT        NOT NULL,
        grade       TEXT        NOT NULL,
        total_marks INT         NOT NULL,
        difficulty  TEXT        NOT NULL,
        raw_json    JSONB       NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON assignments (user_id)`);

    await query(`
      CREATE TABLE IF NOT EXISTS question_papers (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          UUID        NOT NULL,
        subject          TEXT        NOT NULL,
        grade            TEXT        NOT NULL,
        board            TEXT        NOT NULL DEFAULT 'CBSE',
        total_marks      INT         NOT NULL,
        duration_minutes INT         NOT NULL,
        raw_json         JSONB       NOT NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_papers_user_id ON question_papers (user_id)`);

    console.log("[DB] Tables verified/created.");
  } catch (err) {
    console.error("[DB] Table migration warning:", err.message);
  }
}

const server = app.listen(PORT, async () => {
  console.log(`Avantika EduAI API v2.0 running on port ${PORT}`);

  // Log AI provider config on every startup — visible in Azure log stream
  const aiCfg = getAIConfig();
  console.log(
    `[AI] provider=${aiCfg.provider}`,
    aiCfg.provider === "groq"   ? `model=${aiCfg.groq.model}   key_set=${aiCfg.groq.api_key_set}`   :
    aiCfg.provider === "openai" ? `model=${aiCfg.openai.model} key_set=${aiCfg.openai.api_key_set}` :
    /* ollama */                   `base=${aiCfg.ollama.base_url} model=${aiCfg.ollama.model}`
  );

  try {
    await query("SELECT 1");
    console.log("[DB] Connected successfully.");
    await ensureTables();
  } catch (err) {
    console.error("[DB] CONNECTION FAILED:", err.code, err.message);
    console.error("[DB] Check DATABASE_URL in .env —", process.env.DATABASE_URL?.replace(/:\/\/.*@/, "://<redacted>@"));
  }
});

// ── Server-level timeout fix ──────────────────────────────────────────────────
// Node.js < 13 defaults server.timeout to 120 000 ms (2 min), which kills any
// socket still open after 2 minutes.  Azure/Nginx upstream sees the closed
// socket and returns 504.  Ollama with llama3.1 easily takes > 2 min, so the
// request is always killed before Ollama replies.
// Setting server.timeout = 0 disables the Node-level socket kill entirely;
// each route/handler owns its own AbortController timeout instead.
server.timeout = 0;          // was 120 000 in Node < 13 — THIS was the 504 source
server.keepAliveTimeout = 65_000;
server.headersTimeout     = 66_000;
