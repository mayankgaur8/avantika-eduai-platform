-- ============================================================
--  Avantika EduAI — Migration v2
--  Run this AFTER schema.sql is applied.
--  Idempotent (safe to re-run).
-- ============================================================

-- ── Refresh tokens (auth hardening) ─────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,   -- SHA-256 of the raw token
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash);

-- Auto-cleanup: delete expired / revoked tokens older than 7 days
CREATE OR REPLACE FUNCTION cleanup_refresh_tokens() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM refresh_tokens
  WHERE expires_at < NOW() - INTERVAL '7 days' OR revoked = TRUE;
END;
$$;

-- ── Upgrade plan_type enum (add 'pro', 'premium') ───────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pro' AND enumtypid = 'plan_type'::regtype) THEN
    ALTER TYPE plan_type ADD VALUE 'pro';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'premium' AND enumtypid = 'plan_type'::regtype) THEN
    ALTER TYPE plan_type ADD VALUE 'premium';
  END IF;
END;
$$;

-- ── plan_limits rows for new plans ──────────────────────────
INSERT INTO plan_limits (plan, quizzes_per_month, max_questions, pdf_export, multi_teacher)
VALUES
  ('pro',     -1, 30, TRUE, FALSE),
  ('premium', -1, 30, TRUE, TRUE)
ON CONFLICT (plan) DO NOTHING;

-- ── CAT sessions — track timing data ────────────────────────
ALTER TABLE cat_sessions
  ADD COLUMN IF NOT EXISTS score           INT,
  ADD COLUMN IF NOT EXISTS time_taken_secs INT,
  ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ;

-- ── CAT mock attempts — ensure table exists ──────────────────
CREATE TABLE IF NOT EXISTS cat_mock_attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  test_config  JSONB       NOT NULL,
  questions    JSONB       NOT NULL,
  answers      JSONB,
  score_data   JSONB,
  time_taken_seconds INT,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cat_mock_user ON cat_mock_attempts (user_id, created_at DESC);

-- ── CAT analytics helper view ────────────────────────────────
CREATE OR REPLACE VIEW cat_user_analytics AS
SELECT
  user_id,
  COUNT(*) FILTER (WHERE submitted_at IS NOT NULL)       AS total_mocks,
  AVG(
    CASE WHEN score IS NOT NULL AND (
      SELECT COUNT(*) FROM jsonb_array_elements(test_config->'sections') > 0
    ) THEN score END
  )                                                      AS avg_score,
  MAX(percentile_estimate)                               AS best_percentile,
  MAX(submitted_at)                                      AS last_attempt_at
FROM cat_mock_attempts
GROUP BY user_id;

-- ── Users: add last_login tracking ──────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
