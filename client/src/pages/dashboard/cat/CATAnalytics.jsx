import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis } from "recharts";
import api from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";

const PLAN_RANK = { free: 0, pro: 1, premium: 2, teacher: 3, institute: 4, school: 4 };

export default function CATAnalytics() {
  const { user } = useAuth();
  const isPro = (PLAN_RANK[user?.plan] ?? 0) >= PLAN_RANK["pro"];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isPro) { setLoading(false); return; }
    api.get("/cat/analytics/advanced")
      .then(r => setData(r.data.data))
      .catch(e => setError(e.normalized?.message || "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [isPro]);

  if (!isPro) {
    return (
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 text-center">
        <div className="text-3xl mb-2">📊</div>
        <h3 className="font-bold text-gray-900 text-sm">Advanced Analytics</h3>
        <p className="text-xs text-gray-500 mt-1 mb-3">AI-powered insights, weakness detection & improvement trends</p>
        <a href="/dashboard/subscription" className="inline-block bg-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors">
          Upgrade to Pro →
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-32 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-700 text-center">
        {error || "No analytics data yet. Complete a mock test first."}
      </div>
    );
  }

  if (data.total_mocks === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center text-gray-400 text-sm">
        <p className="text-3xl mb-2">🎯</p>
        Complete your first mock test to unlock analytics!
      </div>
    );
  }

  const radarData = Object.entries(data.section_averages).map(([name, value]) => ({
    subject: name,
    score: value,
    fullMark: 24,
  }));

  const weakLabel = { VARC: "Verbal Ability & RC", LRDI: "Logical Reasoning & DI", QA: "Quantitative Aptitude" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Advanced Analytics</h2>
        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">Pro</span>
      </div>

      {/* AI Insights */}
      {data.insights?.length > 0 && (
        <div className="bg-gradient-to-br from-slate-800 to-indigo-900 rounded-2xl p-4 text-white space-y-2">
          <p className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-2">🤖 AI Insights</p>
          {data.insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-slate-200">
              <span className="mt-0.5 flex-shrink-0 text-indigo-400">→</span>
              {ins}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Radar chart */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-3">Section Strengths</p>
          <ResponsiveContainer width="100%" height={160}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
              <Radar name="Score" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
            </RadarChart>
          </ResponsiveContainer>
          <p className="text-xs text-center text-gray-400 mt-1">
            Weak Area: <strong className="text-orange-600">{weakLabel[data.weak_area] || data.weak_area}</strong>
          </p>
        </div>

        {/* Percentile trend */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-3">Percentile Trend</p>
          {data.trend?.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data.trend}>
                <XAxis dataKey="attempt" tick={{ fontSize: 10 }} label={{ value: "Attempt", position: "insideBottom", offset: -2, fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [`${v}th %ile`, "Percentile"]} />
                <Line type="monotone" dataKey="percentile" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-xs text-gray-400">
              Complete 2+ mocks to see trend
            </div>
          )}
        </div>
      </div>

      {/* Section averages */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-xs font-semibold text-gray-600 mb-3">Average Section Score (Last 10 Mocks)</p>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(data.section_averages).map(([sec, avg]) => (
            <div key={sec} className="text-center">
              <div className="text-xl font-bold text-gray-900">{avg}</div>
              <div className="text-xs text-gray-400">{sec}</div>
              <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full"
                  style={{ width: `${Math.min(100, (avg / 24) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Based on {data.total_mocks} mock{data.total_mocks !== 1 ? "s" : ""} · {data.practice_sessions} practice sessions
        </p>
      </div>
    </div>
  );
}
