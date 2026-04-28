import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useEffect, useState } from "react";
import api from "../../api/client";

const cards = [
  { title: "Generate Quiz", desc: "MCQ, Short & Long answer quizzes", icon: "⚡", to: "/dashboard/quiz", color: "from-indigo-500 to-purple-600" },
  { title: "Assignment", desc: "Structured assignments with marks", icon: "📝", to: "/dashboard/assignment", color: "from-blue-500 to-cyan-500" },
  { title: "Question Paper", desc: "Full exam papers with 3 sections", icon: "📄", to: "/dashboard/paper", color: "from-orange-500 to-pink-500" },
  { title: "Saved Papers", desc: "View and manage saved content", icon: "📚", to: "/dashboard/saved", color: "from-green-500 to-teal-500" },
  { title: "Analytics", desc: "Track your generation history", icon: "📊", to: "/dashboard/analytics", color: "from-purple-500 to-indigo-500" },
  { title: "Subscription", desc: "Manage plan and billing", icon: "💎", to: "/dashboard/subscription", color: "from-yellow-500 to-orange-500" },
];

export default function DashboardHome() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ quizzes: 0, assignments: 0, papers: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/quiz/history?limit=1"),
      api.get("/assignment/history"),
      api.get("/papers/history"),
    ])
      .then(([q, a, p]) => {
        setStats({
          quizzes: q.data.data?.length || 0,
          assignments: a.data.data?.length || 0,
          papers: p.data.data?.length || 0,
        });
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  const planLimit = { free: 10, teacher: 200, institute: -1, school: -1 }[user?.plan] ?? 10;

  return (
    <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-5 sm:p-6 text-white">
        <h1 className="text-xl sm:text-2xl font-bold mb-1">
          Good day, {user?.name?.split(" ")[0]}! 👋
        </h1>
        <p className="text-indigo-200 text-sm">
          {user?.school_name ? `${user.school_name} · ` : ""}
          {user?.plan?.toUpperCase() || "FREE"} Plan ·{" "}
          {planLimit === -1 ? "Unlimited generations" : `${planLimit} quizzes/month`}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: "Quizzes", value: stats.quizzes, icon: "⚡", color: "bg-indigo-50 text-indigo-600" },
          { label: "Assignments", value: stats.assignments, icon: "📝", color: "bg-blue-50 text-blue-600" },
          { label: "Papers", value: stats.papers, icon: "📄", color: "bg-orange-50 text-orange-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-5 text-center">
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl ${s.color} flex items-center justify-center text-base sm:text-xl mx-auto mb-2`}>
              {s.icon}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-gray-900">
              {statsLoading ? <span className="inline-block w-4 h-5 bg-gray-200 rounded animate-pulse" /> : s.value}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5 leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Action Cards */}
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {cards.map((card) => (
            <Link
              key={card.to}
              to={card.to}
              className="group bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 hover:shadow-md hover:border-indigo-200 transition-all"
            >
              <div
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-lg sm:text-xl mb-3 sm:mb-4 group-hover:scale-110 transition-transform`}
              >
                {card.icon}
              </div>
              <h3 className="font-semibold text-gray-900 text-sm sm:text-base mb-0.5 sm:mb-1 leading-tight">
                {card.title}
              </h3>
              <p className="text-xs sm:text-sm text-gray-500 leading-snug">{card.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Upgrade Banner for Free Users */}
      {user?.plan === "free" && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-orange-200 rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="font-semibold text-orange-900">Upgrade to Pro Teacher Plan</h3>
              <p className="text-sm text-orange-700 mt-0.5">
                Get 200 quizzes/month, PDF export, and all generators for just ₹299/month
              </p>
            </div>
            <Link
              to="/dashboard/subscription"
              className="flex-shrink-0 bg-orange-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-orange-600 transition-colors text-center"
            >
              Upgrade →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
