const { query, transaction } = require("../db/client");

const DAILY_LIMITS = {
  free: 10,
  teacher: 100,
  institute: 500,
  school: 2000,
  admin: -1,
};

function getDailyLimit(plan) {
  return DAILY_LIMITS[plan] ?? DAILY_LIMITS.free;
}

async function getDailyUsageStatus(userId) {
  const result = await query(
    `SELECT plan, usage_count, usage_reset_date
     FROM users
     WHERE id = $1`,
    [userId]
  );

  const user = result.rows[0];
  if (!user) return null;

  const limit = getDailyLimit(user.plan);
  const usageCount = Number(user.usage_count || 0);
  const remaining = limit === -1 ? null : Math.max(0, limit - usageCount);

  return {
    plan: user.plan,
    limit,
    usageCount,
    usageResetDate: user.usage_reset_date,
    exceeded: limit !== -1 && usageCount >= limit,
    remaining,
  };
}

async function assertWithinDailyLimit(userId) {
  const status = await getDailyUsageStatus(userId);
  if (!status) {
    const err = new Error("User not found.");
    err.status = 404;
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  if (status.exceeded) {
    const err = new Error("You have reached your daily limit. Upgrade to continue.");
    err.status = 429;
    err.code = "USAGE_LIMIT";
    err.details = {
      plan: status.plan,
      limit: status.limit,
      usageCount: status.usageCount,
      usageResetDate: status.usageResetDate,
    };
    throw err;
  }

  return status;
}

async function incrementDailyUsage(userId) {
  return transaction(async (client) => {
    const updated = await client.query(
      `UPDATE users
       SET usage_count = CASE
         WHEN usage_reset_date < CURRENT_DATE THEN 1
         ELSE COALESCE(usage_count, 0) + 1
       END,
       usage_reset_date = CURRENT_DATE,
       updated_at = NOW()
       WHERE id = $1
       RETURNING plan, usage_count, usage_reset_date`,
      [userId]
    );

    return updated.rows[0] || null;
  });
}

module.exports = {
  getDailyUsageStatus,
  assertWithinDailyLimit,
  incrementDailyUsage,
};
