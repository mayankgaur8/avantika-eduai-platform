import { useState } from "react";
import api from "../../api/client";
import toast from "react-hot-toast";

const BOARDS = ["CBSE", "ICSE", "State Board", "JEE", "NEET", "Other"];
const GRADES = ["Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"];

const SECTION_STYLES = {
  A: { border: "border-indigo-100", bg: "bg-indigo-50", title: "text-indigo-900", sub: "text-indigo-600", badge: "bg-indigo-200 text-indigo-800", dot: "bg-indigo-100 text-indigo-700" },
  B: { border: "border-blue-100", bg: "bg-blue-50", title: "text-blue-900", sub: "text-blue-600", badge: "bg-blue-200 text-blue-800", dot: "bg-blue-100 text-blue-700" },
  C: { border: "border-green-100", bg: "bg-green-50", title: "text-green-900", sub: "text-green-600", badge: "bg-green-200 text-green-800", dot: "bg-green-100 text-green-700" },
};

function ErrorBanner({ error, onRetry, loading }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start justify-between gap-3">
      <div className="flex gap-2">
        <span className="text-red-500 mt-0.5 flex-shrink-0">⚠️</span>
        <div>
          <p className="text-sm font-medium text-red-800">Generation Failed</p>
          <p className="text-xs text-red-600 mt-0.5">{error}</p>
        </div>
      </div>
      <button
        onClick={onRetry}
        disabled={loading}
        className="flex-shrink-0 text-sm px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium transition-colors disabled:opacity-50"
      >
        {loading ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

function PaperResult({ paper, onReset }) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">{paper.paper_title}</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {paper.subject} · {paper.grade} · {paper.board} · {paper.total_marks} Marks · {paper.duration_minutes} min
            </p>
          </div>
          <button
            onClick={onReset}
            className="flex-shrink-0 text-sm px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            ← New Paper
          </button>
        </div>
      </div>

      {paper.general_instructions?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-900 mb-2">General Instructions:</p>
          <ul className="space-y-1">
            {paper.general_instructions.map((inst, i) => (
              <li key={i} className="text-xs text-amber-800 flex gap-2">
                <span className="flex-shrink-0">{i + 1}.</span>
                {inst}
              </li>
            ))}
          </ul>
        </div>
      )}

      {paper.sections?.map((section) => {
        const s = SECTION_STYLES[section.section] || SECTION_STYLES.A;
        return (
          <div key={section.section} className={`bg-white rounded-2xl border-2 ${s.border}`}>
            <div className={`${s.bg} rounded-t-2xl px-4 sm:px-5 py-3 flex items-start sm:items-center justify-between gap-2`}>
              <div>
                <h3 className={`font-bold text-sm sm:text-base ${s.title}`}>
                  Section {section.section}: {section.title}
                </h3>
                <p className={`text-xs ${s.sub} mt-0.5`}>
                  {section.instructions} · {section.questions?.length} questions · {section.marks_per_question}M each · {section.total_marks}M total
                </p>
              </div>
              <span className={`flex-shrink-0 text-xs font-bold ${s.badge} px-2.5 py-1 rounded-full`}>
                {section.total_marks}M
              </span>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              {section.questions?.map((q, i) => (
                <div key={q.id || i} className="flex gap-3">
                  <span className={`flex-shrink-0 w-7 h-7 rounded-full ${s.dot} text-xs font-bold flex items-center justify-center`}>
                    {q.id || i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 text-sm leading-relaxed">{q.question}</p>
                    {q.options?.length > 0 && (
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, j) => (
                          <div key={j} className="text-xs px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-700">
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}
                    {q.correct_answer && (
                      <details className="mt-2">
                        <summary className="text-xs text-green-600 cursor-pointer font-medium select-none">
                          Answer Key
                        </summary>
                        <p className="text-xs text-gray-600 mt-1 bg-green-50 rounded-lg p-2 border border-green-200">
                          {q.correct_answer}
                        </p>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PaperGenerator() {
  const [form, setForm] = useState({
    subject: "Mathematics",
    grade: "Grade 10",
    board: "CBSE",
    totalMarks: 80,
    duration: 180,
    mcqCount: 20,
    shortCount: 10,
    longCount: 6,
    topic: "",
    instructions: "",
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post(
        "/papers/generate",
        {
          ...form,
          totalMarks: Number(form.totalMarks),
          duration: Number(form.duration),
          mcqCount: Number(form.mcqCount),
          shortCount: Number(form.shortCount),
          longCount: Number(form.longCount),
        },
        { timeout: 300000 }
      );
      setResult(res.data.data);
      toast.success("Question paper generated!");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        (err.code === "ECONNABORTED" ? "Request timed out. Please retry." : "Generation failed. Please try again.");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    generate();
  };

  if (result) return <PaperResult paper={result} onReset={() => setResult(null)} />;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Question Paper Generator</h1>
        <p className="text-gray-500 text-sm mt-1">
          Create complete exam papers with Section A, B, and C
        </p>
      </div>

      {error && <ErrorBanner error={error} onRetry={generate} loading={loading} />}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-4 sm:space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
            <input
              value={form.subject}
              onChange={set("subject")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Class</label>
            <select
              value={form.grade}
              onChange={set("grade")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {GRADES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Board</label>
            <select
              value={form.board}
              onChange={set("board")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {BOARDS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Topic <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              value={form.topic}
              onChange={set("topic")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Full syllabus"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Total Marks</label>
            <input
              type="number"
              min="20"
              max="200"
              value={form.totalMarks}
              onChange={set("totalMarks")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Duration (minutes)</label>
            <input
              type="number"
              min="30"
              max="240"
              value={form.duration}
              onChange={set("duration")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Section Configuration */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Section Configuration</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { key: "mcqCount", label: "Sec A — MCQ", sub: "1 mark each", max: 30 },
              { key: "shortCount", label: "Sec B — Short", sub: "3 marks each", max: 20 },
              { key: "longCount", label: "Sec C — Long", sub: "5 marks each", max: 10 },
            ].map(({ key, label, sub, max }) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-1 leading-tight">{label}</label>
                <input
                  type="number"
                  min="0"
                  max={max}
                  value={form[key]}
                  onChange={set(key)}
                  className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                />
                <p className="text-[10px] text-gray-400 mt-0.5 text-center leading-tight">{sub}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Special Instructions <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={form.instructions}
            onChange={set("instructions")}
            rows={2}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="Focus on chapters 1–5, include case-study questions…"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 text-white font-semibold py-3 rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating Paper…
            </>
          ) : (
            <>📄 Generate Question Paper</>
          )}
        </button>

        {loading && (
          <p className="text-center text-xs text-gray-400">
            Papers with many questions may take 30–60 seconds. Please wait…
          </p>
        )}
      </form>
    </div>
  );
}
