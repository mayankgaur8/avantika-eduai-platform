/**
 * requirePlan(minPlan) — middleware that enforces plan-level feature gating.
 *
 * Plan hierarchy: free < pro < premium < teacher < institute
 *
 * Usage:
 *   router.post("/cat/tutor", requirePlan("premium"), handler)
 */

const PLAN_RANK = {
  free: 0,
  pro: 1,
  premium: 2,
  teacher: 3,
  institute: 4,
  school: 4,
  admin: 999,
};

/**
 * @param {"pro"|"premium"|"teacher"|"institute"} minPlan
 * @param {string} [featureName] — human-readable name shown in error
 */
function requirePlan(minPlan, featureName = "This feature") {
  const requiredRank = PLAN_RANK[minPlan] ?? 999;
  return (req, res, next) => {
    const userPlan = req.user?.plan || "free";
    const userRank = PLAN_RANK[userPlan] ?? 0;
    if (userRank >= requiredRank) return next();
    return res.status(403).json({
      success: false,
      code: "PLAN_REQUIRED",
      message: `${featureName} requires the ${minPlan} plan or higher. Upgrade at /dashboard/subscription.`,
      requiredPlan: minPlan,
    });
  };
}

module.exports = { requirePlan, PLAN_RANK };
