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
const helmet = require("helmet");

const authRouter = require("./routes/auth");
const quizRouter = require("./routes/quiz");
const assignmentRouter = require("./routes/assignment");
const papersRouter = require("./routes/papers");
const billingRouter = require("./routes/billing");
const paymentRouter = require("./routes/payment");
const adminRouter = require("./routes/admin");
const catRouter = require("./routes/cat");
const { authMiddleware } = require("./middleware/auth");
const { requestContext } = require("./middleware/requestContext");
const { distributedRateLimit } = require("./middleware/distributedRateLimit");
const { sanitizeInput } = require("./middleware/sanitizeInput");
const { query } = require("./db/client");
const { getAIConfig } = require("./claude/client");
const { sendError } = require("./utils/apiResponse");
const cache = require("./cache/cache");
const { initSentry, captureException } = require("./utils/sentry");

const app = express();
app.set("trust proxy", 1); // Required for express-rate-limit behind Azure/nginx proxy
const PORT = process.env.PORT || 3000;
initSentry();

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  process.exit(1);
});

// Emergency liveness route: keep this above all middleware so Azure health checks
// still get a response even if downstream middleware or dependencies misbehave.
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Avantika EduAI API",
    version: "2.0.0",
    uptime: process.uptime(),
  });
});

app.get("/api/ai/status", (req, res) => {
  const aiCfg = getAIConfig();
  return res.json({
    success: true,
    data: {
      provider: aiCfg.provider,
      groqKeySet: aiCfg.groq.api_key_set,
      groqModel: aiCfg.groq.model,
      groqBaseUrl: aiCfg.groq.base_url,
      aiPlatformUrlSet: aiCfg.ai_platform.url_set,
      aiPlatformKeySet: aiCfg.ai_platform.api_key_set,
      timeoutMs: aiCfg.reliability.timeout_ms,
    },
  });
});

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

app.use(helmet({ contentSecurityPolicy: false })); // CSP disabled — Razorpay script injected at runtime
app.use(requestContext);
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
const jsonParser = express.json({ limit: process.env.REQUEST_BODY_LIMIT || "1mb" });
app.use((req, res, next) => {
  if (req.originalUrl === "/api/billing/webhook") {
    return next();
  }
  return jsonParser(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: process.env.REQUEST_BODY_LIMIT || "1mb" }));
app.use(sanitizeInput);

app.use("/api", distributedRateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 120),
  prefix: "api-global",
  message: "Too many requests. Please wait and try again.",
}));

app.use("/api", distributedRateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_MAX || 25),
  prefix: "api-ai",
  skip: (req) => ![
    "/api/assignment",
    "/api/papers",
    "/api/quiz",
    "/api/cat",
  ].some((prefix) => req.originalUrl.startsWith(prefix)),
  message: "AI generation rate limit reached. Please wait a minute before trying again.",
}));

// ── Request logger (dev) ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log(JSON.stringify({
      event: "request_body",
      request_id: req.id,
      endpoint: `${req.method} ${req.url}`,
      body: req.body,
    }));
    next();
  });
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.use("/api/auth", authRouter);
app.use("/api/quiz", authMiddleware, quizRouter);
app.use("/api/assignment", assignmentRouter);
app.use("/api/papers", papersRouter);
app.use("/api/billing", billingRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/admin", adminRouter);
app.use("/api/cat", catRouter);

if (process.env.NODE_ENV !== "production") {
  app.get("/api/debug/routes", (req, res) => {
    res.json({
      routes: app._router.stack
        .filter((r) => r.route)
        .map((r) => r.route.path),
    });
  });

  app.get("/api/debug/ai-config", (req, res) => {
    res.json({ ...getAIConfig(), cache: cache.getStatus() });
  });
}

// 404 handler
app.use((req, res) => {
  return sendError(res, {
    status: 404,
    code: "NOT_FOUND",
    message: "Route not found",
    requestId: req.id,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  const status = Number(err.status || 500);
  const code = err.code || "INTERNAL_ERROR";
  const safeMessage = status >= 500
    ? "Internal server error"
    : (err.message || "Request failed");

  console.error("[Unhandled Error]", {
    requestId: req.id,
    code,
    status,
    message: err.message,
  });

  captureException(err, {
    tags: {
      endpoint: `${req.method} ${req.originalUrl}`,
      request_id: req.id,
      status: String(status),
    },
    user: req.user?.id ? { id: req.user.id, email: req.user.email } : undefined,
    extra: {
      code,
      body: req.body,
      query: req.query,
    },
  });

  res.locals.errorReason = code;

  return sendError(res, {
    status,
    code,
    message: safeMessage,
    requestId: req.id,
  });
});

// ── Start ────────────────────────────────────────────────────────────────────

async function ensureTables() {
  try {
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS usage_count INT NOT NULL DEFAULT 0`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS usage_reset_date DATE NOT NULL DEFAULT CURRENT_DATE`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_usage_reset_date ON users (usage_reset_date)`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS goal TEXT`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS level TEXT`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS weak_areas TEXT[]`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS target_exam_date DATE`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE`);

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

    // ── CAT tables ──────────────────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS cat_sessions (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID        NOT NULL,
        module     TEXT        NOT NULL,
        topic      TEXT,
        difficulty TEXT,
        questions  JSONB       NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_cat_sessions_user_id ON cat_sessions (user_id)`);

    await query(`
      CREATE TABLE IF NOT EXISTS cat_mock_attempts (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id             UUID        NOT NULL,
        test_config         JSONB       NOT NULL,
        questions           JSONB       NOT NULL,
        answers             JSONB,
        score               INT,
        varc_score          INT,
        lrdi_score          INT,
        qa_score            INT,
        time_taken_seconds  INT,
        percentile_estimate INT,
        submitted_at        TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_cat_mock_user_id ON cat_mock_attempts (user_id)`);

    await query(`
      CREATE TABLE IF NOT EXISTS cat_study_plans (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID        NOT NULL,
        exam_date     DATE,
        current_level TEXT,
        plan          JSONB       NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_cat_plans_user_id ON cat_study_plans (user_id)`);

    await query(`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_email_verification_user_id ON email_verification_tokens (user_id)`);

    await query(`
      CREATE TABLE IF NOT EXISTS billing_webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_type ON billing_webhook_events (event_type, created_at DESC)`);

    // ── Billing tables ──────────────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS plan_prices (
        plan          TEXT        PRIMARY KEY,
        display_name  TEXT        NOT NULL,
        amount_paise  INT         NOT NULL,
        currency      TEXT        NOT NULL DEFAULT 'INR',
        billing_cycle TEXT        NOT NULL DEFAULT 'monthly',
        description   TEXT
      )
    `);
    await query(`
      INSERT INTO plan_prices (plan, display_name, amount_paise, billing_cycle, description) VALUES
        ('free',      'Free',                    0,       'monthly', '10 quizzes/month'),
        ('teacher',   'Teacher Plan',        29900,       'monthly', 'Unlimited quizzes, PDF export'),
        ('institute', 'Coaching Institute', 199900,       'monthly', 'Multi-teacher, branding'),
        ('school',    'School Plan',        999900,       'yearly',  'Admin dashboard, bulk export')
      ON CONFLICT (plan) DO NOTHING
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS billing_orders (
        id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id            UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        razorpay_order_id  TEXT        NOT NULL UNIQUE,
        plan               TEXT        NOT NULL,
        amount_paise       INT         NOT NULL,
        currency           TEXT        NOT NULL DEFAULT 'INR',
        status             TEXT        NOT NULL DEFAULT 'created',
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_billing_orders_user_id ON billing_orders (user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_billing_orders_razorpay ON billing_orders (razorpay_order_id)`);
    await query(`
      CREATE TABLE IF NOT EXISTS billing_payments (
        id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id             UUID        NOT NULL REFERENCES billing_orders (id),
        user_id              UUID        NOT NULL REFERENCES users (id),
        razorpay_payment_id  TEXT        NOT NULL UNIQUE,
        razorpay_signature   TEXT        NOT NULL,
        plan                 TEXT        NOT NULL,
        amount_paise         INT         NOT NULL,
        paid_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_billing_payments_user_id ON billing_payments (user_id)`);

    console.log("[DB] Tables verified/created.");
  } catch (err) {
    console.error("[DB] Table migration warning:", err.message);
  }
}

const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Avantika EduAI API v2.0 running on 0.0.0.0:${PORT}`);

  // Log AI provider config on every startup — visible in Azure log stream
  const aiCfg = getAIConfig();
  console.log("[AI CONFIG]", JSON.stringify({
    provider: aiCfg.provider,
    groqModel: aiCfg.groq.model,
    groqKeySet: aiCfg.groq.api_key_set,
    groqBaseUrl: aiCfg.groq.base_url,
    platformUrlSet: aiCfg.ai_platform.url_set,
    platformKeySet: aiCfg.ai_platform.api_key_set,
    timeoutMs: aiCfg.reliability.timeout_ms,
  }));

  try {
    await query("SELECT 1");
    console.log("[DB] Connected successfully.");
    await ensureTables();
  } catch (err) {
    console.error("[DB] CONNECTION FAILED:", err.code, err.message);
    console.error("[DB] Check DATABASE_URL in .env —", process.env.DATABASE_URL?.replace(/:\/\/.*@/, "://<redacted>@"));
  }
});

server.on("error", (err) => {
  console.error("[FATAL] Server failed to start:", {
    code: err.code,
    message: err.message,
    port: PORT,
  });
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
