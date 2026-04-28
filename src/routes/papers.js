const express = require("express");
const { z } = require("zod");
const { callLLM } = require("../claude/client");
const { authMiddleware } = require("../middleware/auth");
const { query } = require("../db/client");

const router = express.Router();
router.use(authMiddleware);

const paperSchema = z.object({
  subject: z.string().min(1),
  grade: z.string().min(1),
  board: z.enum(["CBSE", "ICSE", "State Board", "JEE", "NEET", "Other"]),
  totalMarks: z.number().int().min(20).max(200),
  duration: z.number().int().min(30).max(240), // minutes
  mcqCount: z.number().int().min(0).max(30).default(10),
  shortCount: z.number().int().min(0).max(20).default(5),
  longCount: z.number().int().min(0).max(10).default(3),
  topic: z.string().optional(),
  instructions: z.string().optional(),
});

const PAPER_SYSTEM_PROMPT = `You are an expert Indian school exam paper setter aligned with CBSE, ICSE, JEE and NEET standards.
Generate complete question papers with three sections: MCQ, Short Answer, and Long Answer.
Output ONLY valid JSON with this structure:
{
  "paper_title": "",
  "subject": "",
  "grade": "",
  "board": "",
  "total_marks": 0,
  "duration_minutes": 0,
  "general_instructions": ["", ""],
  "sections": [
    {
      "section": "A",
      "title": "Multiple Choice Questions",
      "type": "MCQ",
      "marks_per_question": 1,
      "total_marks": 0,
      "instructions": "",
      "questions": [
        {
          "id": 1,
          "question": "",
          "options": ["A) ", "B) ", "C) ", "D) "],
          "correct_answer": "",
          "explanation": ""
        }
      ]
    },
    {
      "section": "B",
      "title": "Short Answer Questions",
      "type": "Short Answer",
      "marks_per_question": 3,
      "total_marks": 0,
      "instructions": "",
      "questions": [...]
    },
    {
      "section": "C",
      "title": "Long Answer Questions",
      "type": "Long Answer",
      "marks_per_question": 5,
      "total_marks": 0,
      "instructions": "",
      "questions": [...]
    }
  ]
}`;

router.post("/generate", async (req, res) => {
  const parsed = paperSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: "Validation failed", details: parsed.error.errors });
  }

  const { subject, grade, board, totalMarks, duration, mcqCount, shortCount, longCount, topic, instructions } = parsed.data;

  const userPrompt = `Generate a complete question paper with:
- Subject: ${subject}
- Grade: ${grade}
- Board: ${board}
- Topic/Syllabus: ${topic || "Full syllabus"}
- Total Marks: ${totalMarks}
- Duration: ${duration} minutes
- Section A (MCQ): ${mcqCount} questions, 1 mark each
- Section B (Short Answer): ${shortCount} questions, 3 marks each
- Section C (Long Answer): ${longCount} questions, 5 marks each
- Special Instructions: ${instructions || "Follow standard board guidelines"}

Include general instructions and section-specific instructions. Provide answer keys.`;

  try {
    const paper = await callLLM(PAPER_SYSTEM_PROMPT, userPrompt);

    let savedMeta = { id: null, created_at: new Date().toISOString() };
    let saveWarning = null;

    try {
      const saved = await query(
        `INSERT INTO question_papers (user_id, subject, grade, board, total_marks, duration_minutes, raw_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
        [req.user.id, subject, grade, board, totalMarks, duration, JSON.stringify(paper)]
      );
      savedMeta = { id: saved.rows[0].id, created_at: saved.rows[0].created_at };
    } catch (dbErr) {
      console.error("[Paper Save Error]", dbErr.message);
      saveWarning = "Paper generated but could not be saved to database.";
    }

    res.json({ success: true, data: { ...paper, ...savedMeta }, warning: saveWarning });
  } catch (err) {
    if (err?.code === "CONFIG_ERROR") {
      return res.status(503).json({ success: false, error: err.message });
    }
    if (err?.code === "UPSTREAM_ERROR") {
      console.error("[Paper Upstream Error]", err.message);
      return res.status(502).json({ success: false, error: "AI provider request failed. Check provider config and try again." });
    }
    if (err instanceof SyntaxError) {
      return res.status(502).json({ success: false, error: "AI returned malformed JSON. Please retry." });
    }
    console.error("[Paper Generate Error]", err.message || err);
    res.status(500).json({ success: false, error: "Failed to generate question paper" });
  }
});

router.get("/history", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, subject, grade, board, total_marks, duration_minutes, created_at,
              raw_json->>'paper_title' as paper_title
       FROM question_papers WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[Paper History Error]", err.code, err.message);
    return res.json({ success: true, data: [], warning: "Could not load history: " + err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await query(
      "SELECT * FROM question_papers WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: "Not found" });
    const row = result.rows[0];
    res.json({ success: true, data: { ...row.raw_json, id: row.id, created_at: row.created_at } });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch paper" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await query("DELETE FROM question_papers WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete" });
  }
});

module.exports = router;
