import { useState } from "react";
import api from "../../api/client";
import toast from "react-hot-toast";

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Mixed"];
const GRADES = [
  "Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6",
  "Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12","Competitive",
];

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

function AssignmentResult({ data, onReset }) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">{data.assignment_title}</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {data.subject} · {data.grade} · Total Marks: {data.total_marks} · {data.difficulty}
            </p>
          </div>
          <button
            onClick={onReset}
            className="flex-shrink-0 text-sm px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            ← New Assignment
          </button>
        </div>
        {data.instructions && (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
            <strong>Instructions:</strong> {data.instructions}
          </div>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-3">
        {data.questions?.map((q, i) => (
          <div key={q.id || i} className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
            <div className="flex justify-between items-start gap-3">
              <div className="flex gap-3 flex-1 min-w-0">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-medium text-sm leading-relaxed">{q.question}</p>
                  {q.options?.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, j) => (
                        <div
                          key={j}
                          className="text-xs px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-700"
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.hints && (
                    <p className="text-xs text-gray-400 mt-2 italic">Hint: {q.hints}</p>
                  )}
                  {q.answer_guideline && (
                    <details className="mt-3">
                      <summary className="text-xs text-indigo-600 cursor-pointer font-medium select-none">
                        View Answer Guideline
                      </summary>
                      <p className="text-xs text-gray-600 mt-2 leading-relaxed bg-green-50 rounded-lg p-3 border border-green-200">
                        {q.answer_guideline}
                      </p>
                    </details>
                  )}
                </div>
              </div>
              <span className="flex-shrink-0 text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                {q.marks}M
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AssignmentGenerator() {
  const [form, setForm] = useState({
    subject: "Science",
    topic: "",
    grade: "Grade 8",
    marks: 20,
    difficulty: "Medium",
    numberOfQuestions: 5,
    instructions: "",
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const generate = async () => {
    if (!form.topic.trim()) {
      toast.error("Please enter a topic");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post(
        "/assignment/generate",
        { ...form, marks: Number(form.marks), numberOfQuestions: Number(form.numberOfQuestions) },
        { timeout: 300000 }
      );
      setResult(res.data.data);
      toast.success("Assignment generated!");
    } catch (err) {
      const normalized = err.normalized;
      const msg =
        normalized?.message ||
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

  if (result) return <AssignmentResult data={result} onReset={() => setResult(null)} />;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Assignment Generator</h1>
        <p className="text-gray-500 text-sm mt-1">
          Create structured assignments with mark allocations and answer guidelines
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
              placeholder="Science"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Topic <span className="text-red-400">*</span></label>
            <input
              value={form.topic}
              onChange={set("topic")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Photosynthesis"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Class / Grade</label>
            <select
              value={form.grade}
              onChange={set("grade")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {GRADES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Difficulty</label>
            <select
              value={form.difficulty}
              onChange={set("difficulty")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Total Marks</label>
            <input
              type="number"
              min="5"
              max="100"
              value={form.marks}
              onChange={set("marks")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">No. of Questions</label>
            <input
              type="number"
              min="1"
              max="20"
              value={form.numberOfQuestions}
              onChange={set("numberOfQuestions")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
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
            placeholder="Include diagrams, focus on application questions…"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating…
            </>
          ) : (
            <>📝 Generate Assignment</>
          )}
        </button>

        {loading && (
          <p className="text-center text-xs text-gray-400">
            This usually takes 10–30 seconds. Please wait…
          </p>
        )}
      </form>
    </div>
  );
}
