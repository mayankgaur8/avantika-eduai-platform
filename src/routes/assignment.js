const express = require("express");
const { z } = require("zod");
const { callLLM } = require("../claude/client");
const { ASSIGNMENT_SYSTEM_PROMPT, buildAssignmentPrompt } = require("../claude/prompts");
const { authMiddleware } = require("../middleware/auth");
const { query } = require("../db/client");
const { sendError } = require("../utils/apiResponse");
const {
  assertWithinDailyLimit,
  incrementDailyUsage,
} = require("../middleware/usageLimit");

const router = express.Router();
router.use(authMiddleware);

const assignmentSchema = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
  grade: z.string().min(1),
  marks: z.number().int().min(5).max(100),
  difficulty: z.enum(["Easy", "Medium", "Hard", "Mixed"]),
  numberOfQuestions: z.number().int().min(1).max(20),
  instructions: z.string().optional(),
});

router.post("/generate", async (req, res) => {
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: parsed.error.errors,
      requestId: req.id,
    });
  }

  const { subject, topic, grade, marks, difficulty, numberOfQuestions, instructions } = parsed.data;

  const t0 = Date.now();
  console.log(`[Assignment] REQUEST received — ${new Date().toISOString()}`);

  try {
    await assertWithinDailyLimit(req.user.id);

    const userPrompt = buildAssignmentPrompt({ subject, topic, grade, difficulty, numberOfQuestions, marks, instructions });
    console.log(`[Assignment] calling LLM … (+${Date.now() - t0} ms)`);

    const llmResponse = await callLLM(ASSIGNMENT_SYSTEM_PROMPT, userPrompt, {
      feature: "assignment_generation",
      promptKey: "assignment.generate.v2",
      input: { subject, topic, grade, marks, difficulty, numberOfQuestions, instructions },
      userId: req.user.id,
    });
    const { _meta, ...assignment } = llmResponse;
    if (_meta) {
      res.locals.aiProvider = _meta.provider;
      console.log(`[Assignment] provider=${_meta.provider} latency=${_meta.latencyMs}ms cacheHit=${_meta.cacheHit}`);
    }
    console.log(`[Assignment] LLM returned — total so far ${Date.now() - t0} ms`);

    let savedMeta = { id: null, created_at: new Date().toISOString() };
    let saveWarning = null;

    try {
      const saved = await query(
        `INSERT INTO assignments (user_id, subject, topic, grade, total_marks, difficulty, raw_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
        [req.user.id, subject, topic, grade, marks, difficulty, JSON.stringify(assignment)]
      );
      savedMeta = { id: saved.rows[0].id, created_at: saved.rows[0].created_at };
    } catch (dbErr) {
      console.error("[Assignment Save Error]", dbErr.message);
      saveWarning = "Assignment generated but could not be saved to database.";
    }

    console.log(`[Assignment] RESPONSE sent — total ${Date.now() - t0} ms`);
    await incrementDailyUsage(req.user.id);

    res.json({
      success: true,
      data: { ...assignment, ...savedMeta },
      warning: saveWarning,
    });
  } catch (err) {
    console.error(`[Assignment] ERROR after ${Date.now() - t0} ms — code=${err?.code} msg=${err?.message}`);

    if (err?.code === "CONFIG_ERROR") {
      return sendError(res, {
        status: 503,
        code: "AI_CONFIG_ERROR",
        message: err.message,
        requestId: req.id,
      });
    }
    if (err?.code === "TIMEOUT_ERROR") {
      return sendError(res, {
        status: 504,
        code: "AI_TIMEOUT",
        message: "AI service took too long. Try again.",
        requestId: req.id,
      });
    }
    if (err?.code === "PARSE_ERROR") {
      return sendError(res, {
        status: 502,
        code: "AI_PARSE_ERROR",
        message: "AI returned unparseable output. Please retry.",
        requestId: req.id,
      });
    }
    if (err?.code === "USAGE_LIMIT") {
      return sendError(res, {
        status: 429,
        code: "USAGE_LIMIT",
        message: "You have reached your daily limit. Upgrade to continue.",
        details: err.details,
        requestId: req.id,
      });
    }
    if (err?.code === "UPSTREAM_ERROR") {
      console.error("[Assignment Upstream Error]", err.message);
      return sendError(res, {
        status: 502,
        code: "AI_UPSTREAM_ERROR",
        message: "AI provider request failed. Please try again.",
        requestId: req.id,
      });
    }

    console.error("[Assignment Generate Error]", err.message || err);
    return sendError(res, {
      status: 500,
      code: "ASSIGNMENT_GENERATION_FAILED",
      message: "Failed to generate assignment",
      requestId: req.id,
    });
  }
});

router.get("/history", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, subject, topic, grade, total_marks, difficulty, created_at,
              raw_json->>'assignment_title' as assignment_title
       FROM assignments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    // Graceful fallback for any DB schema issues (table/column missing, etc.)
    console.error("[Assignment History Error]", err.code, err.message);
    return res.json({ success: true, data: [], warning: "Could not load history: " + err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await query(
      "SELECT * FROM assignments WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: "Not found" });
    const row = result.rows[0];
    res.json({ success: true, data: { ...row.raw_json, id: row.id, created_at: row.created_at } });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch assignment" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await query("DELETE FROM assignments WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete" });
  }
});

module.exports = router;
