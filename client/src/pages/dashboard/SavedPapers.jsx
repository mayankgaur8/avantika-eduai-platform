import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import toast from "react-hot-toast";

const TABS = ["Quizzes", "Assignments", "Papers"];
const TAB_ICONS = { Quizzes: "⚡", Assignments: "📝", Papers: "📄" };
const TAB_LINKS = { Quizzes: "/dashboard/quiz", Assignments: "/dashboard/assignment", Papers: "/dashboard/paper" };

function EmptyState({ type }) {
  return (
    <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
      <div className="text-5xl mb-3">{TAB_ICONS[type]}</div>
      <p className="font-medium text-gray-700">No {type.toLowerCase()} yet</p>
      <p className="text-sm text-gray-400 mt-1">
        Generate your first {type.toLowerCase().slice(0, -1)} to see it here
      </p>
      <Link
        to={TAB_LINKS[type]}
        className="inline-block mt-4 bg-indigo-600 text-white text-sm px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors"
      >
        Generate Now →
      </Link>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

export default function SavedPapers() {
  const [activeTab, setActiveTab] = useState("Quizzes");
  const [data, setData] = useState({ Quizzes: [], Assignments: [], Papers: [] });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [q, a, p] = await Promise.all([
        api.get("/quiz/history?limit=50"),
        api.get("/assignment/history"),
        api.get("/papers/history"),
      ]);
      setData({
        Quizzes: q.data.data || [],
        Assignments: a.data.data || [],
        Papers: p.data.data || [],
      });
    } catch {
      toast.error("Failed to load saved content");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleDelete = async (type, id) => {
    if (!confirm("Delete this item?")) return;
    const endpoints = { Quizzes: "/quiz", Assignments: "/assignment", Papers: "/papers" };
    setDeleting(id);
    try {
      await api.delete(`${endpoints[type]}/${id}`);
      toast.success("Deleted");
      setData((prev) => ({ ...prev, [type]: prev[type].filter((i) => i.id !== id) }));
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (d) =>
    new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const items = data[activeTab];
  const total = data.Quizzes.length + data.Assignments.length + data.Papers.length;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Saved Papers</h1>
        <p className="text-gray-500 text-sm mt-1">
          {loading ? "Loading…" : `${total} total item${total !== 1 ? "s" : ""} saved`}
        </p>
      </div>

      {/* Tabs — horizontally scrollable on mobile */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span>{TAB_ICONS[tab]}</span>
            <span>{tab}</span>
            <span className="text-xs text-gray-400">({data[tab].length})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState type={activeTab} />
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:border-indigo-100 hover:shadow-sm transition-all"
            >
              {/* Icon */}
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-base sm:text-lg flex-shrink-0">
                {TAB_ICONS[activeTab]}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">
                  {item.quiz_title ||
                    item.assignment_title ||
                    item.paper_title ||
                    `${item.subject}${item.topic ? ` — ${item.topic}` : ""}`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {[item.subject, item.grade, item.board, item.difficulty]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  · {formatDate(item.created_at)}
                </p>
              </div>

              {/* Right side */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.total_marks && (
                  <span className="hidden sm:inline text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {item.total_marks}M
                  </span>
                )}
                <button
                  onClick={() => handleDelete(activeTab, item.id)}
                  disabled={deleting === item.id}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting === item.id ? "…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
