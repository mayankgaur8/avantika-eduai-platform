import { useAuth } from "../context/AuthContext";

const PLAN_RANK = { free: 0, pro: 1, premium: 2, teacher: 3, institute: 4, school: 4 };

/**
 * Renders children only if user has minPlan or above.
 * Otherwise renders a locked upgrade prompt.
 *
 * Props:
 *   minPlan    — "pro" | "premium" | "teacher" | "institute"
 *   featureName — display name for the feature
 *   compact    — render as small inline badge instead of full card
 */
export default function PlanGate({ minPlan, featureName = "This feature", compact = false, children }) {
  const { user } = useAuth();
  const userRank = PLAN_RANK[user?.plan] ?? 0;
  const required = PLAN_RANK[minPlan] ?? 999;

  if (userRank >= required) return children;

  const planLabel = minPlan.charAt(0).toUpperCase() + minPlan.slice(1);

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span>🔒</span>
        <span>{featureName} — </span>
        <a href="/dashboard/subscription" className="text-indigo-600 font-semibold hover:underline">
          Upgrade to {planLabel}
        </a>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-dashed border-indigo-200 rounded-2xl p-6 text-center">
      <div className="text-3xl mb-2">🔒</div>
      <h3 className="font-bold text-gray-900">{featureName}</h3>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Requires <strong>{planLabel}</strong> plan or above
      </p>
      <a
        href="/dashboard/subscription"
        className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
      >
        Upgrade Now →
      </a>
    </div>
  );
}
