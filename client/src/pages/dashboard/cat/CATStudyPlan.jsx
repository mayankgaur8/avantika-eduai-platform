import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../api/client";
import toast from "react-hot-toast";

const LEVELS = ["Beginner", "Intermediate", "Advanced"];
const WEAK_AREA_OPTIONS = ["QA", "LRDI", "VARC"];
const DAILY_HOURS_OPTIONS = [1, 2, 3, 4, 5, 6];

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

function WeekCard({ week, index }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700">
            W{index + 1}
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">{week.week_label || `Week ${index + 1}`}</p>
            {week.theme && <p className="text-xs text-gray-400">{week.theme}</p>}
          </div>
        </div>
        <span className={`text-gray-400 transition-transform text-sm ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-4 space-y-3 border-t border-gray-50">
          {/* Daily schedule */}
          {week.days?.length > 0 && (
            <div className="mt-3 space-y-2">
              {week.days.map((day, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="flex-shrink-0 w-8 text-xs font-semibold text-purple-600 pt-0.5">
                    {day.day || `D${i + 1}`}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-xs">{day.topic}</p>
                    {day.tasks?.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {day.tasks.map((t, j) => (
                          <li key={j} className="text-xs text-gray-500 flex gap-1.5">
                            <span className="text-purple-400 flex-shrink-0">•</span>
                            {t}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Weekly goals */}
          {week.weekly_goals?.length > 0 && (
            <div className="bg-purple-50 rounded-xl p-3 mt-2">
              <p className="text-xs font-semibold text-purple-800 mb-1.5">Weekly Goals</p>
              <ul className="space-y-1">
                {week.weekly_goals.map((g, i) => (
                  <li key={i} className="text-xs text-gray-700 flex gap-1.5">
                    <span className="text-green-500 flex-shrink-0">✓</span>
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mock test */}
          {week.mock_test && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-orange-800">⏱ Mock Test</p>
              <p className="text-xs text-gray-700 mt-0.5">{week.mock_test}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlanView({ plan, onReset }) {
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold bg-white/15 px-2.5 py-1 rounded-full inline-block mb-2">
              📅 AI STUDY PLAN
            </div>
            <h2 className="text-lg font-bold">{plan.plan_title || "Your CAT Study Plan"}</h2>
            {plan.overview && (
              <p className="text-sm text-purple-200 mt-1 leading-relaxed">{plan.overview}</p>
            )}
          </div>
          <button
            onClick={onReset}
            className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors"
          >
            ← New Plan
          </button>
        </div>

        {/* Meta pills */}
        <div className="flex flex-wrap gap-2 mt-4">
          {plan.exam_date && (
            <span className="text-xs bg-white/10 px-2.5 py-1 rounded-full">
              🎯 Exam: {plan.exam_date}
            </span>
          )}
          {plan.total_weeks && (
            <span className="text-xs bg-white/10 px-2.5 py-1 rounded-full">
              📆 {plan.total_weeks} Weeks
            </span>
          )}
          {plan.daily_hours && (
            <span className="text-xs bg-white/10 px-2.5 py-1 rounded-full">
              ⏰ {plan.daily_hours}h/day
            </span>
          )}
        </div>
      </div>

      {/* Key recommendations */}
      {plan.key_recommendations?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">⚡ Key Recommendations</p>
          <ul className="space-y-1">
            {plan.key_recommendations.map((r, i) => (
              <li key={i} className="text-xs text-gray-700 flex gap-2">
                <span className="text-amber-500 flex-shrink-0 mt-0.5">→</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Phase summary */}
      {plan.phases?.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {plan.phases.map((phase, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 mb-2">
                P{i + 1}
              </div>
              <p className="text-sm font-semibold text-gray-900">{phase.phase_name || `Phase ${i + 1}`}</p>
              <p className="text-xs text-gray-400 mt-0.5">{phase.duration}</p>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">{phase.focus}</p>
            </div>
          ))}
        </div>
      )}

      {/* Weekly breakdown */}
      {plan.weekly_plan?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Week-by-Week Plan</h3>
          <div className="space-y-2">
            {plan.weekly_plan.map((week, i) => (
              <WeekCard key={i} week={week} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Resources */}
      {plan.resources?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">📚 Recommended Resources</p>
          <div className="space-y-2">
            {plan.resources.map((r, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="text-indigo-400 flex-shrink-0 text-xs mt-0.5">•</span>
                <div>
                  <p className="text-xs font-medium text-gray-800">{r.name || r}</p>
                  {r.type && <p className="text-xs text-gray-400">{r.type}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center py-4">
        <button
          onClick={onReset}
          className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Generate New Plan
        </button>
      </div>
    </div>
  );
}

export default function CATStudyPlan() {
  const [form, setForm] = useState({
    examDate: "",
    currentLevel: "Beginner",
    weakAreas: [],
    dailyHours: 3,
    targetPercentile: 90,
  });
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toggleWeakArea = (area) => {
    setForm(f => ({
      ...f,
      weakAreas: f.weakAreas.includes(area)
        ? f.weakAreas.filter(a => a !== area)
        : [...f.weakAreas, area],
    }));
  };

  const generate = async () => {
    if (!form.examDate) { toast.error("Please select your exam date"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/cat/study-plan", form, { timeout: 180000 });
      setPlan(res.data.data);
      toast.success("Study plan ready!");
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

  if (plan) return <PlanView plan={plan} onReset={() => { setPlan(null); setError(null); }} />;

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/dashboard/cat" className="text-sm text-gray-400 hover:text-gray-600">← CAT Prep</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">Study Plan</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-xl">
          📅
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Personalised Study Plan</h1>
          <p className="text-sm text-gray-500">AI builds your day-by-day CAT prep roadmap</p>
        </div>
      </div>

      {error && <ErrorBanner error={error} onRetry={generate} loading={loading} />}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-5">
        {/* Exam date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">CAT Exam Date</label>
          <input
            type="date"
            required
            min={today}
            value={form.examDate}
            onChange={e => setForm(f => ({ ...f, examDate: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Current level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Level</label>
            <div className="flex gap-2">
              {LEVELS.map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, currentLevel: lvl }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${
                    form.currentLevel === lvl
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Daily hours */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Daily Study: <span className="text-purple-600 font-bold">{form.dailyHours}h</span>
            </label>
            <input
              type="range" min="1" max="6"
              value={form.dailyHours}
              onChange={e => setForm(f => ({ ...f, dailyHours: Number(e.target.value) }))}
              className="w-full accent-purple-600 mt-1"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1"><span>1h</span><span>6h</span></div>
          </div>
        </div>

        {/* Weak areas */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Weak Areas <span className="text-gray-400 font-normal">(select all that apply)</span>
          </label>
          <div className="flex gap-2">
            {WEAK_AREA_OPTIONS.map(area => (
              <button
                key={area}
                type="button"
                onClick={() => toggleWeakArea(area)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                  form.weakAreas.includes(area)
                    ? "bg-red-50 text-red-700 border-red-300"
                    : "bg-white text-gray-600 border-gray-200 hover:border-red-200"
                }`}
              >
                {area}
              </button>
            ))}
          </div>
          {form.weakAreas.length === 0 && (
            <p className="text-xs text-gray-400 mt-1.5">None selected — AI will create a balanced plan</p>
          )}
        </div>

        {/* Target percentile */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Target Percentile: <span className="text-purple-600 font-bold">{form.targetPercentile}th</span>
          </label>
          <input
            type="range" min="70" max="99"
            value={form.targetPercentile}
            onChange={e => setForm(f => ({ ...f, targetPercentile: Number(e.target.value) }))}
            className="w-full accent-purple-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1"><span>70th</span><span>99th</span></div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating Your Plan…</>
          ) : (
            <>📅 Generate My Study Plan</>
          )}
        </button>
        {loading && (
          <p className="text-center text-xs text-gray-400">
            AI is crafting your personalised roadmap… 15–45 seconds
          </p>
        )}
      </form>
    </div>
  );
}
