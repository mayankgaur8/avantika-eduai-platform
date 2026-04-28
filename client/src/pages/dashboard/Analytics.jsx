import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import api from "../../api/client";

const COLORS = ["#6366f1", "#3b82f6", "#f97316", "#10b981"];

function StatCard({ label, value, icon, color, loading }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center text-lg mb-3`}>
        {icon}
      </div>
      {loading ? (
        <div className="h-7 w-10 bg-gray-200 rounded animate-pulse mb-1" />
      ) : (
        <div className="text-2xl font-bold text-gray-900">{value}</div>
      )}
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/quiz/history?limit=50"),
      api.get("/assignment/history"),
      api.get("/papers/history"),
    ])
      .then(([q, a, p]) => {
        const quizzes = q.data.data || [];
        const assignments = a.data.data || [];
        const papers = p.data.data || [];

        // Subject breakdown
        const subjectMap = {};
        [...quizzes, ...assignments, ...papers].forEach((item) => {
          if (item.subject) subjectMap[item.subject] = (subjectMap[item.subject] || 0) + 1;
        });
        const subjectData = Object.entries(subjectMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);

        // Monthly trend (last 6 months)
        const monthMap = {};
        [...quizzes, ...assignments, ...papers].forEach((item) => {
          const month = new Date(item.created_at).toLocaleDateString("en-IN", {
            month: "short",
            year: "2-digit",
          });
          monthMap[month] = (monthMap[month] || 0) + 1;
        });
        const monthData = Object.entries(monthMap)
          .map(([month, count]) => ({ month, count }))
          .slice(-6);

        // Type distribution
        const typeData = [
          { name: "Quizzes", value: quizzes.length },
          { name: "Assignments", value: assignments.length },
          { name: "Papers", value: papers.length },
        ].filter((d) => d.value > 0);

        setData({
          quizzes: quizzes.length,
          assignments: assignments.length,
          papers: papers.length,
          subjectData,
          monthData,
          typeData,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = (data?.quizzes || 0) + (data?.assignments || 0) + (data?.papers || 0);

  if (!loading && total === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">Your content generation statistics</p>
        </div>
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
          <div className="text-6xl mb-4">📊</div>
          <p className="text-lg font-semibold text-gray-700">No data yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Start generating quizzes, assignments, or papers to see analytics here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">Your content generation statistics</p>
      </div>

      {/* Summary cards — 2 cols mobile, 4 cols desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Generated" value={total} icon="📊" color="bg-indigo-50 text-indigo-700" loading={loading} />
        <StatCard label="Quizzes" value={data?.quizzes ?? 0} icon="⚡" color="bg-purple-50 text-purple-700" loading={loading} />
        <StatCard label="Assignments" value={data?.assignments ?? 0} icon="📝" color="bg-blue-50 text-blue-700" loading={loading} />
        <StatCard label="Papers" value={data?.papers ?? 0} icon="📄" color="bg-orange-50 text-orange-700" loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Monthly trend */}
        {(loading || (data?.monthData?.length ?? 0) > 0) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Monthly Activity</h3>
            {loading ? (
              <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.monthData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Generated" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Type distribution */}
        {(loading || (data?.typeData?.length ?? 0) > 0) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Content Distribution</h3>
            {loading ? (
              <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
            ) : (
              <div className="flex items-center gap-4 sm:gap-6">
                <ResponsiveContainer width={150} height={150}>
                  <PieChart>
                    <Pie
                      data={data.typeData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      outerRadius={65}
                      innerRadius={38}
                    >
                      {data.typeData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2.5">
                  {data.typeData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="text-sm text-gray-600">{item.name}</span>
                      <span className="text-sm font-semibold text-gray-900 ml-auto pl-4">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Top subjects */}
      {(loading || (data?.subjectData?.length ?? 0) > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Top Subjects</h3>
          {loading ? (
            <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, data.subjectData.length * 32)}>
              <BarChart data={data.subjectData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Count" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
