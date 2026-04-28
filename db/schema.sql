-- ============================================================
--  Avantika AI — Assignment Generator
--  PostgreSQL Schema
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE board_type AS ENUM (
  'CBSE', 'ICSE', 'State Board', 'JEE', 'NEET', 'Other'
);

CREATE TYPE difficulty_type AS ENUM (
  'Easy', 'Medium', 'Hard', 'Mixed'
);

CREATE TYPE question_type AS ENUM (
  'MCQ', 'Short Answer', 'Long Answer', 'Numerical', 'Mixed'
);

CREATE TYPE plan_type AS ENUM (
  'free', 'teacher', 'institute', 'school'
);

-- ============================================================
--  USERS
-- ============================================================
CREATE TABLE users (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT          NOT NULL,
  email         TEXT          NOT NULL UNIQUE,
  password_hash TEXT          NOT NULL,
  role          TEXT          NOT NULL DEFAULT 'teacher',  -- teacher | admin
  plan          plan_type     NOT NULL DEFAULT 'free',
  usage_count   INT           NOT NULL DEFAULT 0,
  usage_reset_date DATE       NOT NULL DEFAULT CURRENT_DATE,
  school_name   TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);

-- ============================================================
--  QUIZZES
-- ============================================================
CREATE TABLE quizzes (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- metadata
  quiz_title       TEXT          NOT NULL,
  subject          TEXT          NOT NULL,
  topic            TEXT          NOT NULL,
  grade            TEXT          NOT NULL,
  board            board_type    NOT NULL DEFAULT 'CBSE',
  difficulty       difficulty_type NOT NULL,
  question_type    question_type NOT NULL,
  total_questions  INT           NOT NULL CHECK (total_questions BETWEEN 1 AND 30),

  -- full model response stored for rendering / re-use
  raw_json         JSONB         NOT NULL,

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quizzes_user_id   ON quizzes (user_id);
CREATE INDEX idx_quizzes_subject   ON quizzes (subject);
CREATE INDEX idx_quizzes_board     ON quizzes (board);
CREATE INDEX idx_quizzes_created   ON quizzes (created_at DESC);

-- Full-text search on title + topic
CREATE INDEX idx_quizzes_fts ON quizzes
  USING GIN (to_tsvector('english', quiz_title || ' ' || topic));

-- ============================================================
--  QUESTIONS  (normalised rows extracted from raw_json)
-- ============================================================
CREATE TABLE questions (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id        UUID          NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
  sequence       INT           NOT NULL,            -- 1-based order within quiz
  question_text  TEXT          NOT NULL,
  type           question_type NOT NULL,
  options        JSONB,                             -- ["A) ...", "B) ..."] or NULL
  correct_answer TEXT          NOT NULL,
  explanation    TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (quiz_id, sequence)
);

CREATE INDEX idx_questions_quiz_id ON questions (quiz_id);

-- ============================================================
--  USAGE LOGS  (track generation counts for plan enforcement)
-- ============================================================
CREATE TABLE usage_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  action      TEXT        NOT NULL DEFAULT 'quiz_generate',
  quiz_id     UUID        REFERENCES quizzes (id) ON DELETE SET NULL,
  tokens_used INT,                                  -- model input + output tokens
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_user_month ON usage_logs (user_id, created_at DESC);

-- ============================================================
--  PLAN LIMITS  (lookup table — easy to update without deploy)
-- ============================================================
CREATE TABLE plan_limits (
  plan             plan_type  PRIMARY KEY,
  quizzes_per_month INT       NOT NULL,
  max_questions    INT        NOT NULL,
  pdf_export       BOOLEAN    NOT NULL DEFAULT FALSE,
  multi_teacher    BOOLEAN    NOT NULL DEFAULT FALSE
);

INSERT INTO plan_limits VALUES
  ('free',      10,  10, FALSE, FALSE),
  ('teacher',  -1,   30, TRUE,  FALSE),   -- -1 = unlimited
  ('institute', -1,  30, TRUE,  TRUE),
  ('school',    -1,  30, TRUE,  TRUE);

-- ============================================================
--  HELPER FUNCTION — updated_at auto-trigger
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
--  ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS assignments (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  subject       TEXT          NOT NULL,
  topic         TEXT          NOT NULL,
  grade         TEXT          NOT NULL,
  total_marks   INT           NOT NULL,
  difficulty    difficulty_type NOT NULL,
  raw_json      JSONB         NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON assignments (user_id);

-- ============================================================
--  QUESTION PAPERS
-- ============================================================
CREATE TABLE IF NOT EXISTS question_papers (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  subject          TEXT          NOT NULL,
  grade            TEXT          NOT NULL,
  board            board_type    NOT NULL DEFAULT 'CBSE',
  total_marks      INT           NOT NULL,
  duration_minutes INT           NOT NULL,
  raw_json         JSONB         NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_papers_user_id ON question_papers (user_id);

-- ============================================================
--  SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan        plan_type     NOT NULL,
  status      TEXT          NOT NULL DEFAULT 'active',
  payment_id  TEXT,
  expiry_date TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
