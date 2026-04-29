import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import api from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";

const PLAN_RANK = { free: 0, pro: 1, premium: 2, teacher: 3, institute: 4, school: 4, admin: 999 };
const SECTION_COLORS = { VARC: "#10b981", LRDI: "#3b82f6", QA: "#6366f1" };
const WEAK_LABEL = { VARC: "Verbal Ability & RC", LRDI: "Logical Reasoning & DI", QA: "Quantitative Aptitude" };

function Skeleton({ className }) {
  return <div className={`bg-gray-100 rounded-xl animate-pulse ${className}`} />;
}

function InsightCard({ text, index }) {
  const palettes = [
    "bg-amber-50 border-amber-200 text-amber-900",
    "bg-red-50 border-red-200 text-red-900",
    "bg-green-50 border-green-200 text-green-900",
    "bg-indigo-50 border-indigo-200 text-indigo-900",
  ];
  const icons = ["💡", "⚠️", "📈", "🎯"];
  return (
    <div className={`flex gap-3 p-3.5 rounded-xl border ${palettes[index % 4]}`}>
      <span className="text-base flex-shrink-0">{icons[index % 4]}</span>
      <p className="text-sm leading-relaxed">{text}</p>
    </div>
  );
}

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
      .catch(e => setError(e.response?.data?.message || "Failed to load analytics."))
      .finally(() => setLoading(false));
  }, [isPro]);

  const radarData = data
    ? Object.entries(data.section_averages).map(([subject, score]) => ({ subject, score, fullMark: 24 }))
    : [];

  const trendData = data?.trend?.map(t => ({
    name: `Mock ${t.attempt}`,
    percentile: t.percentile,
    score: t.score,
  })) || [];

  const bestPercentile = data?.trend?.length
    ? Math.max(...data.trend.map(t => t.percentile))
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link to="/dashboard/cat" className="text-sm text-gray-400 hover:text-gray-600">← CAT Prep</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">Analytics</span>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl">
            📊
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Performance Analytics</h1>
            <p className="text-sm text-gray-500">AI-powered insights from your mock tests</p>
          </div>
        </div>
        {isPro && (
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-semibold">
            Pro Analytics
          </span>
        )}
      </div>

      {/* Upgrade gate */}
      {!isPro && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-3">📊</div>
          <h3 className="font-bold text-gray-900 text-base mb-1">Advanced Analytics — Pro Feature</h3>
          <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">
            Unlock AI-powered insights, weak area detection, radar charts, and percentile trend tracking.
          </p>
          <Link
            to="/dashboard/subscription"
            className="inline-block bg-indigo-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Upgrade to Pro →
          </Link>
        </div>
      )}

      {/* Error */}
      {isPro && !loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Empty state */}
      {isPro && !loading && !error && data?.total_mocks === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <div className="text-5xl mb-3">🎯</div>
          <h3 className="font-semibold text-gray-800 text-base">No mock data yet</h3>
          <p className="text-sm text-gray-400 mt-1 mb-5">
            Take at least one CAT mock test to unlock your analytics.
          </p>
          <Link
            to="/dashboard/cat/mock"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            Take a Mock Test →
          </Link>
        </div>
      )}

      {/* Main dashboard */}
      {isPro && (loading || (!error && (data?.total_mocks ?? 0) > 0)) && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Mock Tests", value: data?.total_mocks ?? 0, icon: "⏱️", color: "bg-orange-50 text-orange-700" },
              { label: "Practice Sets", value: data?.practice_sessions ?? 0, icon: "📝", color: "bg-indigo-50 text-indigo-700" },
              { label: "Weak Area", value: data?.weak_area ?? "—", icon: "⚠️", color: "bg-red-50 text-red-700" },
              { label: "Best %ile", value: bestPercentile != null ? `${bestPercentile}th` : "—", icon: "🏆", color: "bg-green-50 text-green-700" },
            ].map(s => (
              <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center text-sm mb-2`}>{s.icon}</div>
                {loading
                  ? <div className="h-6 w-10 bg-gray-200 rounded animate-pulse mb-1" />
                  : <div className="text-xl font-bold text-gray-900">{s.value}</div>
                }
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Radar */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
              <h3 className="font-semibold text-gray-900 mb-0.5">Section Strength</h3>
              <p className="text-xs text-gray-400 mb-4">Average score across all mocks (max 24)</p>
              {loading ? <Skeleton className="h-52" /> : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 13, fontWeight: 600, fill: "#374151" }} />
                      <Radar name="Score" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
                      <Tooltip formatter={(v) => [`${v} / 24`, "Avg Score"]} />
                    </RadarChart>
                  </ResponsiveContainer>
                  <div className="flex justify-around mt-1">
                    {radarData.map(r => (
                      <div key={r.subject} className="text-center">
                        <div className="text-sm font-bold text-gray-900">{r.score}</div>
                        <div className="text-xs text-gray-400">{r.subject}</div>
                      </div>
                    ))}
                  </div>
                  {data.weak_area && (
                    <p className="text-xs text-center text-red-600 mt-2 font-medium">
                      Weakest: {WEAK_LABEL[data.weak_area] || data.weak_area}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Trend line */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
              <h3 className="font-semibold text-gray-900 mb-0.5">Percentile Trend</h3>
              <p className="text-xs text-gray-400 mb-4">Estimated CAT percentile per mock attempt</p>
              {loading ? <Skeleton className="h-52" /> : trendData.length < 2 ? (
                <div className="h-48 flex items-center justify-center text-center">
                  <div>
                    <div className="text-3xl mb-2">📈</div>
                    <p className="text-sm text-gray-400">Take 2+ mock tests to see your trend</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="th" />
                    <Tooltip formatter={(v) => [`~${v}th %ile`]} />
                    <Line type="monotone" dataKey="percentile" stroke="#f97316" strokeWidth={2.5}
                      dot={{ r: 4, fill: "#f97316" }} activeDot={{ r: 6 }} name="Percentile" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Section breakdown bars */}
          {!loading && data && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Section Breakdown</h3>
              <div className="space-y-3">
                {Object.entries(data.section_averages).map(([sec, avg]) => (
                  <div key={sec}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-700">{WEAK_LABEL[sec] || sec}</span>
                      <span className="text-sm font-bold text-gray-900">{avg} / 24</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, (avg / 24) * 100)}%`, backgroundColor: SECTION_COLORS[sec] || "#6366f1" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Based on {data.total_mocks} mock{data.total_mocks !== 1 ? "s" : ""} · {data.practice_sessions} practice sessions
              </p>
            </div>
          )}

          {/* AI Insights */}
          {!loading && data?.insights?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
              <h3 className="font-semibold text-gray-900 mb-3">AI Insights</h3>
              <div className="space-y-2.5">
                {data.insights.map((text, i) => <InsightCard key={i} text={text} index={i} />)}
              </div>
            </div>
          )}

          {/* Quick actions */}
          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-4">
              <Link to="/dashboard/cat/mock"
                className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm text-center transition-colors">
                ⏱ Take Mock Test
              </Link>
              <Link to={`/dashboard/cat/practice/${data?.weak_area || "QA"}`}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl text-sm text-center transition-colors">
                📝 Practice {data?.weak_area || "QA"}
              </Link>
              <Link to="/dashboard/cat/study-plan"
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl text-sm text-center transition-colors">
                📅 Update Study Plan
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
