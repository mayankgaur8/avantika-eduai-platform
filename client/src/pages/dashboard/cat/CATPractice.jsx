import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../../../api/client";
import toast from "react-hot-toast";
import AITutor from "../../../components/AITutor";

const MODULE_META = {
  QA: {
    label: "Quantitative Aptitude",
    icon: "🔢",
    color: "bg-indigo-600",
    hover: "hover:bg-indigo-700",
    accent: "text-indigo-600",
    topics: [
      "Time and Work", "Time Speed Distance", "Profit and Loss", "Simple & Compound Interest",
      "Percentages", "Ratio and Proportion", "Mixtures and Alligations", "Number Theory",
      "Quadratic Equations", "Progressions (AP/GP)", "Permutation & Combination",
      "Probability", "Geometry (Triangles)", "Mensuration (2D/3D)", "Coordinate Geometry",
      "Logarithms", "Functions and Graphs", "Inequalities",
    ],
  },
  LRDI: {
    label: "Logical Reasoning & DI",
    icon: "🧩",
    color: "bg-blue-600",
    hover: "hover:bg-blue-700",
    accent: "text-blue-600",
    topics: [
      "Linear Arrangements", "Circular Arrangements", "Blood Relations", "Direction Sense",
      "Scheduling & Sequencing", "Team Selection", "Games & Tournaments",
      "Data Tables (DI)", "Bar Charts (DI)", "Line Graphs (DI)",
      "Pie Charts (DI)", "Caselet DI", "Network / Venn Diagrams",
    ],
  },
  VARC: {
    label: "Verbal Ability & RC",
    icon: "📖",
    color: "bg-green-600",
    hover: "hover:bg-green-700",
    accent: "text-green-600",
    topics: [
      "RC: Business & Economics", "RC: Philosophy & Ethics", "RC: Science & Technology",
      "RC: History & Society", "RC: Literature & Culture",
      "Para-jumbles (4 sentences)", "Para-jumbles (5 sentences)",
      "Para-summary", "Odd Sentence Out", "Sentence Completion",
    ],
  },
};

const DIFFICULTIES = ["Easy", "Medium", "Hard"];

function ErrorBanner({ error, onRetry, loading }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start justify-between gap-3">
      <div className="flex gap-2">
        <span className="flex-shrink-0 mt-0.5">⚠️</span>
        <div>
          <p className="text-sm font-medium text-red-800">Generation Failed</p>
          <p className="text-xs text-red-600 mt-0.5">{error}</p>
        </div>
      </div>
      <button
        onClick={onRetry}
        disabled={loading}
        className="flex-shrink-0 text-sm px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium disabled:opacity-50"
      >
        {loading ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

function QuestionCard({ q, index, showAnswers, onToggle }) {
  const isRevealed = showAnswers[q.id];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
      {/* Group context (RC passage / DI set data) */}
      {q.group_context && index === 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-sm text-gray-700 leading-relaxed">
          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
            {q.question_group || "Passage / Data"}
          </p>
          {q.group_context}
        </div>
      )}
      {q.group_context && index > 0 && (
        <p className="text-xs text-gray-400 italic mb-3">Refer to the passage/data above.</p>
      )}

      <div className="flex gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 font-medium text-sm leading-relaxed">{q.question}</p>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {q.options?.map((opt, j) => {
              const letter = opt.charAt(0);
              const isCorrect = isRevealed && letter === q.correct_answer;
              return (
                <div
                  key={j}
                  className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                    isCorrect
                      ? "bg-green-50 border-green-300 text-green-800 font-semibold"
                      : "bg-gray-50 border-gray-200 text-gray-700"
                  }`}
                >
                  {opt}
                </div>
              );
            })}
          </div>

          {q.time_estimate_seconds && (
            <p className="text-xs text-gray-400 mt-2">
              ⏱ Suggested time: {q.time_estimate_seconds}s · {q.marks}M / −{q.negative_marks}M
            </p>
          )}

          <button
            onClick={() => onToggle(q.id)}
            className="mt-3 text-xs text-indigo-600 font-semibold hover:underline"
          >
            {isRevealed ? "Hide Solution" : "Show Solution & Shortcut"}
          </button>

          {isRevealed && (
            <div className="mt-3 space-y-2">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-green-800 mb-1">
                  ✓ Answer: {q.correct_answer}
                </p>
                <p className="text-xs text-gray-700 leading-relaxed">{q.explanation}</p>
              </div>
              {q.shortcut && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1">⚡ Shortcut Trick</p>
                  <p className="text-xs text-gray-700">{q.shortcut}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CATPractice() {
  const { module: moduleParam } = useParams();
  const catModule = ["QA", "LRDI", "VARC"].includes(moduleParam) ? moduleParam : "QA";
  const meta = MODULE_META[catModule];

  const [form, setForm] = useState({ topic: meta.topics[0], difficulty: "Medium", numberOfQuestions: 5 });
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAnswers, setShowAnswers] = useState({});

  const toggleAnswer = (id) => setShowAnswers(prev => ({ ...prev, [id]: !prev[id] }));

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/cat/practice/generate", {
        module: catModule,
        topic: form.topic,
        difficulty: form.difficulty,
        numberOfQuestions: Number(form.numberOfQuestions),
      }, { timeout: 120000 });
      setSession(res.data.data);
      setShowAnswers({});
      toast.success("Practice set ready!");
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error ||
        (err.code === "ECONNABORTED" ? "Request timed out. Please retry." : "Generation failed. Please retry.");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); generate(); };

  if (session) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 ${meta.accent}`}>{catModule}</span>
                <span className="text-xs text-gray-400">{session.difficulty}</span>
              </div>
              <h2 className="text-lg font-bold text-gray-900">{session.session_title}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{session.total_questions} questions · +3 / −1 marking</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAnswers(
                  session.questions.every(q => showAnswers[q.id])
                    ? {}
                    : Object.fromEntries(session.questions.map(q => [q.id, true]))
                )}
                className="text-sm px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                {session.questions.every(q => showAnswers[q.id]) ? "Hide All" : "Reveal All"}
              </button>
              <button
                onClick={() => setSession(null)}
                className="text-sm px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                ← New Set
              </button>
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-3">
          {session.questions?.map((q, i) => (
            <QuestionCard key={q.id || i} q={q} index={i} showAnswers={showAnswers} onToggle={toggleAnswer} />
          ))}
        </div>

        <div className="text-center py-4">
          <button
            onClick={() => { setSession(null); setError(null); }}
            className={`${meta.color} ${meta.hover} text-white font-semibold px-6 py-3 rounded-xl transition-colors`}
          >
            Generate Another Set
          </button>
        </div>

        <AITutor
          question={session.questions?.[0]?.question}
          section={catModule}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/dashboard/cat" className="text-sm text-gray-400 hover:text-gray-600">← CAT Prep</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">{meta.label}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${meta.color} flex items-center justify-center text-xl`}>
          {meta.icon}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{meta.label}</h1>
          <p className="text-sm text-gray-500">AI-generated CAT-level practice questions</p>
        </div>
      </div>

      {error && <ErrorBanner error={error} onRetry={generate} loading={loading} />}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Topic</label>
          <select
            value={form.topic}
            onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {meta.topics.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Difficulty</label>
            <div className="flex gap-2">
              {DIFFICULTIES.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, difficulty: d }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border ${
                    form.difficulty === d
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Questions: <span className="text-indigo-600 font-bold">{form.numberOfQuestions}</span>
            </label>
            <input
              type="range" min="2" max="15"
              value={form.numberOfQuestions}
              onChange={e => setForm(f => ({ ...f, numberOfQuestions: e.target.value }))}
              className="w-full accent-indigo-600 mt-1"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1"><span>2</span><span>15</span></div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full ${meta.color} ${meta.hover} text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2`}
        >
          {loading ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating CAT Questions…</>
          ) : (
            <>{meta.icon} Generate {catModule} Questions</>
          )}
        </button>
        {loading && <p className="text-center text-xs text-gray-400">Generating high-quality CAT questions… 10–30 seconds</p>}
      </form>
    </div>
  );
}
