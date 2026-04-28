const express = require("express");
const { z } = require("zod");
const { callLLM } = require("../claude/client");
const {
  CAT_QA_SYSTEM_PROMPT,
  CAT_LRDI_SYSTEM_PROMPT,
  CAT_VARC_SYSTEM_PROMPT,
  CAT_STUDY_PLAN_SYSTEM_PROMPT,
  buildCATPrompt,
  buildCATMockPrompt,
  buildStudyPlanPrompt,
} = require("../claude/prompts");
const { authMiddleware } = require("../middleware/auth");
const { query } = require("../db/client");
const { sendError, sendSuccess } = require("../utils/apiResponse");
const { assertWithinDailyLimit, incrementDailyUsage } = require("../middleware/usageLimit");

const router = express.Router();
router.use(authMiddleware);

const SYSTEM_PROMPTS = {
  QA: CAT_QA_SYSTEM_PROMPT,
  LRDI: CAT_LRDI_SYSTEM_PROMPT,
  VARC: CAT_VARC_SYSTEM_PROMPT,
};

// ── POST /api/cat/practice/generate ─────────────────────────────────────────

const practiceSchema = z.object({
  module: z.enum(["QA", "LRDI", "VARC"]),
  topic: z.string().min(1, "Topic is required"),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  numberOfQuestions: z.number().int().min(2).max(15),
});

router.post("/practice/generate", async (req, res) => {
  const t0 = Date.now();
  const parsed = practiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: parsed.error.errors,
      requestId: req.id,
    });
  }

  const { module: catModule, topic, difficulty, numberOfQuestions } = parsed.data;
  const userId = req.user.id;

  try {
    await assertWithinDailyLimit(userId);

    console.log(`[CAT-Practice] module=${catModule} topic=${topic} difficulty=${difficulty} n=${numberOfQuestions}`);
    const userPrompt = buildCATPrompt({ module: catModule, topic, difficulty, numberOfQuestions });
    const session = await callLLM(SYSTEM_PROMPTS[catModule], userPrompt);
    console.log(`[CAT-Practice] LLM done after ${Date.now() - t0} ms`);

    // Persist session
    let sessionId = null;
    try {
      const saved = await query(
        `INSERT INTO cat_sessions (user_id, module, topic, difficulty, questions)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [userId, catModule, topic, difficulty, JSON.stringify(session)]
      );
      sessionId = saved.rows[0].id;
    } catch (dbErr) {
      console.error("[CAT] session save error:", dbErr.message);
    }

    await incrementDailyUsage(userId);
    return sendSuccess(res, { ...session, id: sessionId });
  } catch (err) {
    console.error(`[CAT-Practice] ERROR code=${err?.code} msg=${err?.message}`);
    if (err?.code === "USAGE_LIMIT") {
      return sendError(res, { status: 429, code: "USAGE_LIMIT", message: err.message, details: err.details, requestId: req.id });
    }
    if (err?.code === "CONFIG_ERROR") return sendError(res, { status: 503, code: "AI_CONFIG_ERROR", message: err.message, requestId: req.id });
    if (err?.code === "TIMEOUT_ERROR") return sendError(res, { status: 504, code: "AI_TIMEOUT", message: "AI took too long. Please retry.", requestId: req.id });
    if (err?.code === "PARSE_ERROR") return sendError(res, { status: 502, code: "AI_PARSE_ERROR", message: "AI returned invalid output. Please retry.", requestId: req.id });
    return sendError(res, { status: 500, code: "CAT_PRACTICE_FAILED", message: "Failed to generate practice questions.", requestId: req.id });
  }
});

// ── GET /api/cat/practice/history ────────────────────────────────────────────

router.get("/practice/history", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, module, topic, difficulty,
              jsonb_array_length(questions->'questions') as question_count,
              created_at
       FROM cat_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [req.user.id]
    );
    return sendSuccess(res, result.rows);
  } catch (err) {
    console.error("[CAT] history error:", err.message);
    return sendSuccess(res, []);
  }
});

// ── POST /api/cat/mock/start ─────────────────────────────────────────────────
// Generates 3 sections in parallel (8 questions each = 24 total).

router.post("/mock/start", async (req, res) => {
  const t0 = Date.now();
  const userId = req.user.id;

  try {
    await assertWithinDailyLimit(userId);

    console.log(`[CAT-Mock] generating 3 sections in parallel …`);
    const [varcSession, lrdiSession, qaSession] = await Promise.all([
      callLLM(CAT_VARC_SYSTEM_PROMPT, buildCATMockPrompt("VARC")),
      callLLM(CAT_LRDI_SYSTEM_PROMPT, buildCATMockPrompt("LRDI")),
      callLLM(CAT_QA_SYSTEM_PROMPT,   buildCATMockPrompt("QA")),
    ]);
    console.log(`[CAT-Mock] all sections ready after ${Date.now() - t0} ms`);

    // Merge into one attempt, assign global IDs
    const varc = (varcSession.questions || []).map((q, i) => ({ ...q, id: i + 1, section: "VARC" }));
    const lrdi = (lrdiSession.questions || []).map((q, i) => ({ ...q, id: varc.length + i + 1, section: "LRDI" }));
    const qa   = (qaSession.questions || []).map((q, i)   => ({ ...q, id: varc.length + lrdi.length + i + 1, section: "QA" }));
    const allQuestions = [...varc, ...lrdi, ...qa];

    const testConfig = {
      sections: [
        { name: "VARC", label: "Verbal Ability & RC", duration_minutes: 40, question_ids: varc.map(q => q.id) },
        { name: "LRDI", label: "Logical Reasoning & DI", duration_minutes: 40, question_ids: lrdi.map(q => q.id) },
        { name: "QA",   label: "Quantitative Aptitude", duration_minutes: 40, question_ids: qa.map(q => q.id) },
      ],
      total_duration_minutes: 120,
      total_questions: allQuestions.length,
      marking: { correct: 3, wrong: -1, unattempted: 0 },
    };

    // Strip correct answers from what we send to client (anti-cheat)
    const clientQuestions = allQuestions.map(({ correct_answer, explanation, shortcut, ...rest }) => rest);

    // Save attempt to DB
    let attemptId = null;
    try {
      const saved = await query(
        `INSERT INTO cat_mock_attempts (user_id, test_config, questions)
         VALUES ($1, $2, $3) RETURNING id`,
        [userId, JSON.stringify(testConfig), JSON.stringify(allQuestions)]
      );
      attemptId = saved.rows[0].id;
    } catch (dbErr) {
      console.error("[CAT-Mock] save error:", dbErr.message);
    }

    await incrementDailyUsage(userId);

    return sendSuccess(res, {
      attempt_id: attemptId,
      config: testConfig,
      questions: clientQuestions,
    });
  } catch (err) {
    console.error(`[CAT-Mock] ERROR code=${err?.code} msg=${err?.message}`);
    if (err?.code === "USAGE_LIMIT") return sendError(res, { status: 429, code: "USAGE_LIMIT", message: err.message, details: err.details, requestId: req.id });
    if (err?.code === "TIMEOUT_ERROR") return sendError(res, { status: 504, code: "AI_TIMEOUT", message: "Mock test generation timed out. Please retry.", requestId: req.id });
    if (err?.code === "CONFIG_ERROR") return sendError(res, { status: 503, code: "AI_CONFIG_ERROR", message: err.message, requestId: req.id });
    return sendError(res, { status: 500, code: "MOCK_START_FAILED", message: "Failed to generate mock test. Please try again.", requestId: req.id });
  }
});

// ── POST /api/cat/mock/submit ─────────────────────────────────────────────────

const submitSchema = z.object({
  attempt_id: z.string().uuid(),
  answers: z.record(z.string(), z.string()),
  time_taken_seconds: z.number().int().min(0),
});

router.post("/mock/submit", async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, { status: 400, code: "VALIDATION_ERROR", message: "Invalid submit payload", requestId: req.id });
  }

  const { attempt_id, answers, time_taken_seconds } = parsed.data;
  const userId = req.user.id;

  try {
    const result = await query(
      "SELECT * FROM cat_mock_attempts WHERE id = $1 AND user_id = $2",
      [attempt_id, userId]
    );
    if (!result.rows.length) {
      return sendError(res, { status: 404, code: "NOT_FOUND", message: "Attempt not found", requestId: req.id });
    }

    const attempt = result.rows[0];
    const questions = attempt.questions;
    const config = attempt.test_config;

    // Score calculation
    const sectionScores = {};
    const questionResults = [];

    for (const section of config.sections) {
      let correct = 0, wrong = 0, unattempted = 0;
      for (const qId of section.question_ids) {
        const q = questions.find(q => q.id === qId);
        if (!q) continue;
        const given = answers[String(qId)];
        if (!given) {
          unattempted++;
          questionResults.push({ id: qId, section: section.name, status: "unattempted", correct_answer: q.correct_answer, explanation: q.explanation, shortcut: q.shortcut });
        } else if (given === q.correct_answer) {
          correct++;
          questionResults.push({ id: qId, section: section.name, status: "correct", given_answer: given, correct_answer: q.correct_answer, explanation: q.explanation, shortcut: q.shortcut });
        } else {
          wrong++;
          questionResults.push({ id: qId, section: section.name, status: "wrong", given_answer: given, correct_answer: q.correct_answer, explanation: q.explanation, shortcut: q.shortcut });
        }
      }
      const score = correct * config.marking.correct + wrong * config.marking.wrong;
      sectionScores[section.name] = { correct, wrong, unattempted, score, max_score: section.question_ids.length * config.marking.correct };
    }

    const totalScore = Object.values(sectionScores).reduce((sum, s) => sum + s.score, 0);
    const maxScore = questions.length * config.marking.correct;
    const percentileEstimate = estimatePercentile(totalScore, maxScore);
    const accuracy = questions.length > 0 ? Math.round((Object.values(sectionScores).reduce((s, v) => s + v.correct, 0) / questions.length) * 100) : 0;

    // Persist result
    await query(
      `UPDATE cat_mock_attempts
       SET answers = $1, score = $2, varc_score = $3, lrdi_score = $4, qa_score = $5,
           time_taken_seconds = $6, percentile_estimate = $7, submitted_at = NOW()
       WHERE id = $8`,
      [
        JSON.stringify(answers),
        totalScore,
        sectionScores.VARC?.score ?? 0,
        sectionScores.LRDI?.score ?? 0,
        sectionScores.QA?.score ?? 0,
        time_taken_seconds,
        percentileEstimate,
        attempt_id,
      ]
    );

    return sendSuccess(res, {
      attempt_id,
      total_score: totalScore,
      max_score: maxScore,
      percentile_estimate: percentileEstimate,
      accuracy_percent: accuracy,
      section_scores: sectionScores,
      time_taken_seconds,
      question_results: questionResults,
    });
  } catch (err) {
    console.error("[CAT-Mock Submit]", err.message);
    return sendError(res, { status: 500, code: "SUBMIT_FAILED", message: "Failed to process submission.", requestId: req.id });
  }
});

function estimatePercentile(score, maxScore) {
  const pct = score / maxScore;
  if (pct >= 0.85) return 99;
  if (pct >= 0.75) return 97;
  if (pct >= 0.65) return 95;
  if (pct >= 0.55) return 90;
  if (pct >= 0.45) return 85;
  if (pct >= 0.35) return 75;
  if (pct >= 0.25) return 65;
  if (pct >= 0.15) return 50;
  return 35;
}

// ── GET /api/cat/mock/history ─────────────────────────────────────────────────

router.get("/mock/history", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, score, varc_score, lrdi_score, qa_score,
              percentile_estimate, time_taken_seconds, submitted_at, created_at,
              test_config->>'total_questions' as total_questions
       FROM cat_mock_attempts
       WHERE user_id = $1 AND submitted_at IS NOT NULL
       ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    return sendSuccess(res, result.rows);
  } catch (err) {
    console.error("[CAT] mock history error:", err.message);
    return sendSuccess(res, []);
  }
});

// ── POST /api/cat/study-plan ──────────────────────────────────────────────────

const studyPlanSchema = z.object({
  examDate: z.string().min(1),
  currentLevel: z.enum(["Beginner", "Intermediate", "Advanced"]),
  weakAreas: z.array(z.string()).optional(),
  dailyHours: z.number().min(1).max(12),
  targetPercentile: z.number().min(50).max(99).optional(),
});

router.post("/study-plan", async (req, res) => {
  const t0 = Date.now();
  const parsed = studyPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, { status: 400, code: "VALIDATION_ERROR", message: "Validation failed", details: parsed.error.errors, requestId: req.id });
  }

  const userId = req.user.id;
  try {
    await assertWithinDailyLimit(userId);
    const userPrompt = buildStudyPlanPrompt(parsed.data);
    const plan = await callLLM(CAT_STUDY_PLAN_SYSTEM_PROMPT, userPrompt);
    console.log(`[CAT-StudyPlan] done after ${Date.now() - t0} ms`);

    let planId = null;
    try {
      const saved = await query(
        `INSERT INTO cat_study_plans (user_id, exam_date, current_level, plan)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [userId, parsed.data.examDate, parsed.data.currentLevel, JSON.stringify(plan)]
      );
      planId = saved.rows[0].id;
    } catch (dbErr) {
      console.error("[CAT] study plan save error:", dbErr.message);
    }

    await incrementDailyUsage(userId);
    return sendSuccess(res, { ...plan, id: planId });
  } catch (err) {
    console.error(`[CAT-StudyPlan] ERROR code=${err?.code} msg=${err?.message}`);
    if (err?.code === "USAGE_LIMIT") return sendError(res, { status: 429, code: "USAGE_LIMIT", message: err.message, requestId: req.id });
    if (err?.code === "TIMEOUT_ERROR") return sendError(res, { status: 504, code: "AI_TIMEOUT", message: "Study plan generation timed out. Please retry.", requestId: req.id });
    return sendError(res, { status: 500, code: "STUDY_PLAN_FAILED", message: "Failed to generate study plan.", requestId: req.id });
  }
});

// ── GET /api/cat/analytics ────────────────────────────────────────────────────

router.get("/analytics", async (req, res) => {
  try {
    const [sessions, mocks] = await Promise.all([
      query(
        `SELECT module, difficulty, created_at FROM cat_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [req.user.id]
      ),
      query(
        `SELECT score, varc_score, lrdi_score, qa_score, percentile_estimate, submitted_at
         FROM cat_mock_attempts WHERE user_id = $1 AND submitted_at IS NOT NULL ORDER BY submitted_at DESC LIMIT 20`,
        [req.user.id]
      ),
    ]);

    const moduleBreakdown = { QA: 0, LRDI: 0, VARC: 0 };
    sessions.rows.forEach(s => { moduleBreakdown[s.module] = (moduleBreakdown[s.module] || 0) + 1; });

    const mockTrend = mocks.rows.map(m => ({
      date: m.submitted_at,
      score: m.score,
      percentile: m.percentile_estimate,
      varc: m.varc_score,
      lrdi: m.lrdi_score,
      qa: m.qa_score,
    }));

    const bestMock = mocks.rows.reduce((best, m) => (!best || m.score > best.score ? m : best), null);

    return sendSuccess(res, {
      total_sessions: sessions.rows.length,
      total_mocks: mocks.rows.length,
      module_breakdown: moduleBreakdown,
      mock_trend: mockTrend,
      best_mock_score: bestMock?.score ?? null,
      best_percentile: bestMock?.percentile_estimate ?? null,
    });
  } catch (err) {
    console.error("[CAT-Analytics]", err.message);
    return sendSuccess(res, { total_sessions: 0, total_mocks: 0, module_breakdown: { QA: 0, LRDI: 0, VARC: 0 }, mock_trend: [], best_mock_score: null, best_percentile: null });
  }
});

module.exports = router;
