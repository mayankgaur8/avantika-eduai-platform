import { useState } from "react";
import api from "../../api/client";
import toast from "react-hot-toast";

const BOARDS = ["CBSE", "ICSE", "State Board", "JEE", "NEET", "Other"];
const DIFFICULTIES = ["Easy", "Medium", "Hard", "Mixed"];
const Q_TYPES = ["MCQ", "Short Answer", "Long Answer", "Numerical", "Mixed"];
const GRADES = [
  "Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6",
  "Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12","Competitive",
];

function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

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

function QuizResult({ quiz, onReset }) {
  const [showAnswers, setShowAnswers] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const downloadPDF = async (answers) => {
    setDownloading(true);
    try {
      const res = await api.post(`/quiz/pdf?answers=${answers}`, quiz, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${quiz.quiz_title || "quiz"}-${answers ? "answers" : "student"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded!");
    } catch {
      toast.error("PDF download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">{quiz.quiz_title}</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {quiz.subject} · {quiz.grade} · {quiz.board} · {quiz.difficulty}
            </p>
          </div>
          <button
            onClick={onReset}
            className="text-sm px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors flex-shrink-0"
          >
            ← New Quiz
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowAnswers(!showAnswers)}
            className="text-sm px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            {showAnswers ? "Hide" : "Show"} Answers
          </button>
          <button
            onClick={() => downloadPDF(false)}
            disabled={downloading}
            className="text-sm px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            📥 Student PDF
          </button>
          <button
            onClick={() => downloadPDF(true)}
            disabled={downloading}
            className="text-sm px-3 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-60"
          >
            📋 Answer Key
          </button>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-3">
        {quiz.questions?.map((q, i) => (
          <div key={q.id || i} className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-medium text-sm leading-relaxed">{q.question}</p>
                {q.options?.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, j) => (
                      <div
                        key={j}
                        className={`text-xs px-3 py-2 rounded-lg border ${
                          showAnswers && opt.startsWith(q.correct_answer?.charAt(0))
                            ? "bg-green-50 border-green-300 text-green-800 font-medium"
                            : "bg-gray-50 border-gray-200 text-gray-700"
                        }`}
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                )}
                {showAnswers && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs font-semibold text-green-700">✓ Answer: {q.correct_answer}</p>
                    {q.explanation && (
                      <p className="text-xs text-gray-500 italic">{q.explanation}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QuizGenerator() {
  const [form, setForm] = useState({
    subject: "Mathematics",
    topic: "",
    grade: "Grade 10",
    board: "CBSE",
    difficulty: "Medium",
    questionType: "MCQ",
    numberOfQuestions: 10,
  });
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const generate = async () => {
    if (!form.topic.trim()) {
      toast.error("Please enter a topic");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post(
        "/quiz/generate",
        { ...form, numberOfQuestions: Number(form.numberOfQuestions) },
        { timeout: 300000 }
      );
      setQuiz(res.data.data);
      toast.success("Quiz generated successfully!");
    } catch (err) {
      const normalized = err.normalized;
      const msg =
        normalized?.message ||
        err.response?.data?.error ||
        err.response?.data?.message ||
        (err.code === "ECONNABORTED" ? "Request timed out. The AI is busy — please retry." : "Generation failed. Please try again.");
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

  if (quiz) return <QuizResult quiz={quiz} onReset={() => setQuiz(null)} />;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Quiz Generator</h1>
        <p className="text-gray-500 text-sm mt-1">
          Generate AI-powered quizzes aligned with Indian curriculum
        </p>
      </div>

      {error && (
        <ErrorBanner error={error} onRetry={generate} loading={loading} />
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-4 sm:space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
            <input
              value={form.subject}
              onChange={(e) => set("subject")(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Mathematics"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Topic <span className="text-red-400">*</span></label>
            <input
              value={form.topic}
              onChange={(e) => set("topic")(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Quadratic Equations"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Grade / Class" value={form.grade} onChange={set("grade")} options={GRADES} />
          <Select label="Board" value={form.board} onChange={set("board")} options={BOARDS} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Difficulty" value={form.difficulty} onChange={set("difficulty")} options={DIFFICULTIES} />
          <Select label="Question Type" value={form.questionType} onChange={set("questionType")} options={Q_TYPES} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Number of Questions:{" "}
            <span className="text-indigo-600 font-bold">{form.numberOfQuestions}</span>
          </label>
          <input
            type="range"
            min="1"
            max="30"
            value={form.numberOfQuestions}
            onChange={(e) => set("numberOfQuestions")(e.target.value)}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>1</span>
            <span>30</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating Quiz…
            </>
          ) : (
            <>⚡ Generate Quiz</>
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
