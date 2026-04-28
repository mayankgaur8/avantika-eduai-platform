const express = require("express");
const { z } = require("zod");
const { callLLM } = require("../claude/client");
const { QUIZ_SYSTEM_PROMPT, buildQuizPrompt } = require("../claude/prompts");
const {
  saveQuiz,
  getQuizzesByUser,
  getQuizById,
  deleteQuiz,
  getMonthlyUsageCount,
  getUserPlanLimit,
} = require("../db/quizQueries");
const { generateQuizPdf } = require("../pdf/generator");
const { sendError } = require("../utils/apiResponse");
const {
  assertWithinDailyLimit,
  incrementDailyUsage,
} = require("../middleware/usageLimit");

const router = express.Router();

// ── Validation Schema ────────────────────────────────────────────────────────

const quizSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  topic: z.string().min(1, "Topic is required"),
  grade: z.string().min(1, "Grade is required"),
  board: z
    .enum(["CBSE", "ICSE", "State Board", "JEE", "NEET", "Other"], {
      errorMap: () => ({
        message: "Board must be one of: CBSE, ICSE, State Board, JEE, NEET, Other",
      }),
    })
    .default("CBSE"),
  difficulty: z.enum(["Easy", "Medium", "Hard", "Mixed"], {
    errorMap: () => ({
      message: "Difficulty must be one of: Easy, Medium, Hard, Mixed",
    }),
  }),
  questionType: z.enum(
    ["MCQ", "Short Answer", "Long Answer", "Numerical", "Mixed"],
    {
      errorMap: () => ({
        message:
          "questionType must be one of: MCQ, Short Answer, Long Answer, Numerical, Mixed",
      }),
    }
  ),
  numberOfQuestions: z
    .number()
    .int()
    .min(1, "Minimum 1 question")
    .max(30, "Maximum 30 questions per request"),
  // ── Debug / diagnostic fields (no-op in production if not sent) ─────────
  // model_preference: override OLLAMA_MODEL for this request, e.g. "phi3:mini"
  model_preference: z.string().optional(),
  // debug_raw: skip JSON parsing and return Ollama's raw text (for diagnosis)
  debug_raw: z.boolean().optional(),
});

// ── POST /api/quiz/generate ──────────────────────────────────────────────────
router.post("/generate", async (req, res) => {
  const t0 = Date.now();
  console.log(`[Quiz] REQUEST received — ${new Date().toISOString()}`);

  // 1. Validate input
  const parsed = quizSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: parsed.error.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
      requestId: req.id,
    });
  }

  // Extract debug/diagnostic options before passing to prompt builder
  const { model_preference, debug_raw, ...coreInput } = parsed.data;
  const input = coreInput;
  console.log(`[Quiz] workflow=mcq_generation  model_preference=${model_preference || "default (env)"}  debug_raw=${!!debug_raw}`);

  // 2. Plan limit check (req.user set by auth middleware; skip if not present)
  const userId = req.user?.id ?? null;
  if (userId) {
    try {
      await assertWithinDailyLimit(userId);
    } catch (err) {
      return sendError(res, {
        status: err.status || 429,
        code: err.code || "USAGE_LIMIT",
        message: err.message,
        details: err.details,
        requestId: req.id,
      });
    }

    const [limit, used] = await Promise.all([
      getUserPlanLimit(userId),
      getMonthlyUsageCount(userId),
    ]);

    if (limit && limit.quizzes_per_month !== -1 && used >= limit.quizzes_per_month) {
      return sendError(res, {
        status: 429,
        code: "USAGE_LIMIT",
        message: `Monthly limit of ${limit.quizzes_per_month} quizzes reached. Upgrade your plan.`,
        requestId: req.id,
      });
    }
  }

  try {
    // 3. Build prompt
    console.log(`[Quiz] building prompt … (+${Date.now() - t0} ms)`);
    const userPrompt = buildQuizPrompt(input);
    console.log(`[Quiz] prompt built (${userPrompt.length} chars) — calling AI provider … (+${Date.now() - t0} ms)`);

    // No retries — single attempt only (mcq_generation workflow)
    const llmResponse = await callLLM(QUIZ_SYSTEM_PROMPT, userPrompt, {
      model: model_preference || undefined,
      rawBypass: !!debug_raw,
      feature: "quiz_generation",
      promptKey: "quiz.generate.v2",
      input,
      userId,
    });
    const { _meta, ...quiz } = llmResponse;
    if (_meta) {
      res.locals.aiProvider = _meta.provider;
      console.log(`[Quiz] provider=${_meta.provider} latency=${_meta.latencyMs}ms cacheHit=${_meta.cacheHit}`);
    }
    console.log(`[Quiz] AI returned — total so far ${Date.now() - t0} ms`);

    // 4. Persist to DB if user is authenticated
    let savedQuizId = null;
    if (userId && !debug_raw) {
      console.log(`[Quiz] saving to DB …`);
      const saved = await saveQuiz(userId, input, quiz);
      savedQuizId = saved.id;
      console.log(`[Quiz] DB save OK id=${savedQuizId} (+${Date.now() - t0} ms)`);

      await incrementDailyUsage(userId);
    }

    console.log(`[Quiz] RESPONSE sent — total ${Date.now() - t0} ms`);
    return res.status(200).json({
      success: true,
      data: { ...quiz, id: savedQuizId },
    });
  } catch (error) {
    console.error(`[Quiz] ERROR after ${Date.now() - t0} ms — code=${error?.code} msg=${error?.message}`);

    if (error?.code === "CONFIG_ERROR") {
      return sendError(res, {
        status: 503,
        code: "AI_CONFIG_ERROR",
        message: error.message,
        requestId: req.id,
      });
    }

    if (error?.code === "TIMEOUT_ERROR") {
      return sendError(res, {
        status: 504,
        code: "AI_TIMEOUT",
        message: "AI service took too long. Try again.",
        requestId: req.id,
      });
    }

    // Fail fast: Ollama returned text that isn't valid JSON
    if (error?.code === "PARSE_ERROR") {
      return sendError(res, {
        status: 502,
        code: "AI_PARSE_ERROR",
        message: `AI returned unparseable output: ${error.message}`,
        details: { raw: error.rawResponse?.slice(0, 1000) },
        requestId: req.id,
      });
    }

    if (error?.code === "UPSTREAM_ERROR") {
      console.error("[Quiz Upstream Error]", error.message);
      return sendError(res, {
        status: 502,
        code: "AI_UPSTREAM_ERROR",
        message: "AI provider request failed. Check provider URL/model and try again.",
        requestId: req.id,
      });
    }

    if (error instanceof SyntaxError) {
      return sendError(res, {
        status: 502,
        code: "AI_PARSE_ERROR",
        message: "AI returned malformed JSON. Please retry.",
        requestId: req.id,
      });
    }

    console.error("[Quiz Generate Error]", error.message);
    return sendError(res, {
      status: 500,
      code: "QUIZ_GENERATION_FAILED",
      message: "Failed to generate quiz. Please try again.",
      requestId: req.id,
    });
  }
});

// ── GET /api/quiz/history ────────────────────────────────────────────────────
router.get("/history", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorised" });
  }

  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = parseInt(req.query.offset) || 0;

  const quizzes = await getQuizzesByUser(userId, { limit, offset });
  return res.status(200).json({ success: true, data: quizzes });
});

// ── GET /api/quiz/:id ────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorised" });
  }

  const quiz = await getQuizById(req.params.id, userId);
  if (!quiz) {
    return res.status(404).json({ success: false, error: "Quiz not found" });
  }

  return res.status(200).json({ success: true, data: quiz });
});

// ── DELETE /api/quiz/:id ─────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorised" });
  }

  const deleted = await deleteQuiz(req.params.id, userId);
  if (!deleted) {
    return res.status(404).json({ success: false, error: "Quiz not found" });
  }

  return res.status(200).json({ success: true, message: "Quiz deleted" });
});

// ── POST /api/quiz/pdf ───────────────────────────────────────────────────────
// Generate a PDF from a quiz JSON body (for quizzes not yet saved to DB).
// Query params: ?answers=true  →  answer key edition
//
// Body: the full quiz JSON object returned by /generate
router.post("/pdf", async (req, res) => {
  const quiz = req.body;

  if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) {
    return res.status(400).json({
      success: false,
      error: "Request body must be a valid quiz object with questions.",
    });
  }

  const includeAnswers = req.query.answers === "true";
  const schoolName = req.query.school || "";

  try {
    const pdfBuffer = await generateQuizPdf(quiz, { includeAnswers, schoolName });
    const edition = includeAnswers ? "answer-key" : "student";
    const filename = `${(quiz.quiz_title || "quiz").replace(/\s+/g, "-")}-${edition}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("[PDF Generate Error]", err.message);
    return res.status(500).json({ success: false, error: "Failed to generate PDF." });
  }
});

// ── GET /api/quiz/:id/pdf ────────────────────────────────────────────────────
// Generate a PDF from a quiz saved in the database.
// Query params: ?answers=true  →  answer key edition
router.get("/:id/pdf", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorised" });
  }

  const quiz = await getQuizById(req.params.id, userId);
  if (!quiz) {
    return res.status(404).json({ success: false, error: "Quiz not found" });
  }

  // raw_json has the full model output; fall back to the DB row itself
  const quizData = quiz.raw_json || quiz;
  const includeAnswers = req.query.answers === "true";
  const schoolName = req.query.school || "";

  try {
    const pdfBuffer = await generateQuizPdf(quizData, { includeAnswers, schoolName });
    const edition = includeAnswers ? "answer-key" : "student";
    const filename = `${(quizData.quiz_title || "quiz").replace(/\s+/g, "-")}-${edition}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("[PDF Generate Error]", err.message);
    return res.status(500).json({ success: false, error: "Failed to generate PDF." });
  }
});

module.exports = router;
