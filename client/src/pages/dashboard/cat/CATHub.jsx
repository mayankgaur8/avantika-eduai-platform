import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../../../api/client";

const MODULES = [
  {
    to: "/dashboard/cat/practice/QA",
    label: "Quantitative Aptitude",
    short: "QA",
    icon: "🔢",
    desc: "Arithmetic · Algebra · Geometry · Number Theory · P&C",
    color: "from-indigo-500 to-purple-600",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
  },
  {
    to: "/dashboard/cat/practice/LRDI",
    label: "Logical Reasoning & DI",
    short: "LRDI",
    icon: "🧩",
    desc: "Arrangements · Puzzles · Data Tables · Bar/Pie Charts",
    color: "from-blue-500 to-cyan-500",
    bg: "bg-blue-50",
    text: "text-blue-700",
  },
  {
    to: "/dashboard/cat/practice/VARC",
    label: "Verbal Ability & RC",
    short: "VARC",
    icon: "📖",
    desc: "Reading Comprehension · Para-jumbles · Para-summary",
    color: "from-green-500 to-teal-500",
    bg: "bg-green-50",
    text: "text-green-700",
  },
];

export default function CATHub() {
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    api.get("/cat/analytics").then(r => setAnalytics(r.data.data)).catch(() => {});
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
      {/* Hero */}
      <div className="bg-gradient-to-r from-slate-800 to-indigo-900 rounded-2xl p-5 sm:p-7 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-semibold mb-3">
              <span>🎯</span> CAT & MBA Preparation
            </div>
            <h1 className="text-xl sm:text-2xl font-bold mb-1">
              AI-Powered CAT Prep
            </h1>
            <p className="text-slate-300 text-sm max-w-md">
              Practice CAT-level questions, take full mock tests, and get a personalised AI study plan — all in one place.
            </p>
          </div>
          <div className="hidden sm:block text-5xl">🎓</div>
        </div>

        {/* Quick stats */}
        {analytics && (
          <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-white/10">
            {[
              { label: "Sessions", value: analytics.total_sessions },
              { label: "Mock Tests", value: analytics.total_mocks },
              { label: "Best %ile", value: analytics.best_percentile ? `${analytics.best_percentile}th` : "—" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-xl sm:text-2xl font-bold">{s.value ?? 0}</div>
                <div className="text-xs text-slate-300 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Module Cards */}
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Practice by Section</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {MODULES.map(m => (
            <Link
              key={m.to}
              to={m.to}
              className="group bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 hover:shadow-md hover:border-indigo-200 transition-all"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform`}>
                {m.icon}
              </div>
              <div className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${m.bg} ${m.text} mb-2`}>
                {m.short}
              </div>
              <h3 className="font-semibold text-gray-900 text-sm mb-1">{m.label}</h3>
              <p className="text-xs text-gray-400 leading-snug">{m.desc}</p>
              <div className="mt-3 text-xs text-indigo-600 font-medium group-hover:underline">
                Start Practice →
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Mock Test + Study Plan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/dashboard/cat/mock"
          className="group bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200 rounded-2xl p-5 hover:border-orange-400 transition-all"
        >
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-110 transition-transform">
              ⏱️
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold text-orange-600 mb-1">FULL MOCK TEST</div>
              <h3 className="font-bold text-gray-900">CAT Mock Test</h3>
              <p className="text-xs text-gray-500 mt-1">
                24 questions · 3 sections · 120-min timer · Real exam simulation
              </p>
              <div className="mt-2 text-xs text-orange-600 font-semibold group-hover:underline">
                Start Mock Test →
              </div>
            </div>
          </div>
        </Link>

        <Link
          to="/dashboard/cat/study-plan"
          className="group bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-2xl p-5 hover:border-purple-400 transition-all"
        >
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-110 transition-transform">
              📅
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold text-purple-600 mb-1">AI STUDY PLAN</div>
              <h3 className="font-bold text-gray-900">Personalised Study Plan</h3>
              <p className="text-xs text-gray-500 mt-1">
                Enter your exam date and level — AI builds your day-by-day CAT prep plan
              </p>
              <div className="mt-2 text-xs text-purple-600 font-semibold group-hover:underline">
                Generate Plan →
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Mock test history */}
      {analytics?.mock_trend?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Recent Mock Scores</h3>
          <div className="space-y-2">
            {analytics.mock_trend.slice(0, 5).map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">Score: {m.score}</span>
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                      ~{m.percentile}th %ile
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                    <span>VARC {m.varc}</span>
                    <span>LRDI {m.lrdi}</span>
                    <span>QA {m.qa}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
