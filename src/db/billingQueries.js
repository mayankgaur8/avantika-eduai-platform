"use strict";

const { query, transaction } = require("./client");

function addBillingCycle(date, billingCycle = "monthly") {
  const nextDate = new Date(date);
  if (billingCycle === "yearly") {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
  } else {
    nextDate.setMonth(nextDate.getMonth() + 1);
  }
  return nextDate;
}

/**
 * Get all plan prices for the pricing page.
 */
async function getAllPlanPrices() {
  const result = await query(
    `SELECT pp.*, pl.quizzes_per_month, pl.max_questions, pl.pdf_export, pl.multi_teacher
     FROM plan_prices pp
     JOIN plan_limits pl ON pl.plan = pp.plan
     ORDER BY pp.amount_paise ASC`
  );
  return result.rows;
}

/**
 * Get a single plan price row.
 */
async function getPlanPrice(plan) {
  const result = await query(
    `SELECT * FROM plan_prices WHERE plan = $1`,
    [plan]
  );
  return result.rows[0] ?? null;
}

async function getSubscriptionByUserId(userId) {
  const result = await query(
    `SELECT * FROM subscriptions WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

/**
 * Save a newly created Razorpay order.
 */
async function createOrder(userId, razorpayOrderId, plan, amountPaise) {
  const result = await query(
    `INSERT INTO billing_orders (user_id, razorpay_order_id, plan, amount_paise)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, razorpayOrderId, plan, amountPaise]
  );
  return result.rows[0];
}

/**
 * Get an order by Razorpay order ID.
 */
async function getOrderByRazorpayId(razorpayOrderId) {
  const result = await query(
    `SELECT * FROM billing_orders WHERE razorpay_order_id = $1`,
    [razorpayOrderId]
  );
  return result.rows[0] ?? null;
}

/**
 * Mark order as paid, record payment, and upgrade user plan — all in one transaction.
 */
async function fulfillPayment({ orderId, userId, plan, razorpayPaymentId, razorpaySignature, amountPaise, billingCycle = "monthly" }) {
  return transaction(async (client) => {
    const orderResult = await client.query(
      `SELECT * FROM billing_orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) {
      throw new Error("Billing order not found.");
    }

    const existingPaymentResult = await client.query(
      `SELECT * FROM billing_payments WHERE razorpay_payment_id = $1`,
      [razorpayPaymentId]
    );
    if (existingPaymentResult.rows.length || order.status === "paid") {
      return { alreadyProcessed: true, plan: order.plan };
    }

    await client.query(
      `UPDATE billing_orders SET status = 'paid', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    const paymentInsert = await client.query(
      `INSERT INTO billing_payments
         (order_id, user_id, razorpay_payment_id, razorpay_signature, plan, amount_paise)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (razorpay_payment_id) DO NOTHING
       RETURNING id`,
      [orderId, userId, razorpayPaymentId, razorpaySignature, plan, amountPaise]
    );

    if (!paymentInsert.rows.length) {
      return { alreadyProcessed: true, plan: order.plan };
    }

    const expiryDate = addBillingCycle(new Date(), billingCycle);

    await client.query(
      `INSERT INTO subscriptions (user_id, plan, status, payment_id, expiry_date)
       VALUES ($1, $2, 'active', $3, $4)
       ON CONFLICT (user_id)
       DO UPDATE SET
         plan = EXCLUDED.plan,
         status = 'active',
         payment_id = EXCLUDED.payment_id,
         expiry_date = EXCLUDED.expiry_date`,
      [userId, plan, razorpayPaymentId, expiryDate]
    );

    await client.query(
      `UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2`,
      [plan, userId]
    );

    return { alreadyProcessed: false, plan, expiryDate };
  });
}

/**
 * Mark an order as failed.
 */
async function failOrder(razorpayOrderId) {
  await query(
    `UPDATE billing_orders SET status = 'failed', updated_at = NOW() WHERE razorpay_order_id = $1`,
    [razorpayOrderId]
  );
}

async function recordWebhookEvent(eventId, eventType, payload) {
  if (!eventId) {
    return true;
  }

  const result = await query(
    `INSERT INTO billing_webhook_events (event_id, event_type, payload)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [eventId, eventType, payload]
  );

  return Boolean(result.rows[0]);
}

async function syncUserPlanState(userId) {
  return transaction(async (client) => {
    const subscriptionResult = await client.query(
      `SELECT plan, status, expiry_date
       FROM subscriptions
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    const subscription = subscriptionResult.rows[0];

    if (!subscription) {
      await client.query(
        `UPDATE users SET plan = 'free', updated_at = NOW() WHERE id = $1 AND plan <> 'free'`,
        [userId]
      );
      return "free";
    }

    const isActive = subscription.status === "active" && (!subscription.expiry_date || new Date(subscription.expiry_date) > new Date());
    if (isActive) {
      await client.query(
        `UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2 AND plan <> $1`,
        [subscription.plan, userId]
      );
      return subscription.plan;
    }

    await client.query(
      `UPDATE subscriptions SET status = 'expired' WHERE user_id = $1 AND status <> 'expired'`,
      [userId]
    );
    await client.query(
      `UPDATE users SET plan = 'free', updated_at = NOW() WHERE id = $1 AND plan <> 'free'`,
      [userId]
    );
    return "free";
  });
}

async function cancelSubscriptionAtPeriodEnd(userId) {
  await query(
    `UPDATE subscriptions
     SET status = 'cancelled'
     WHERE user_id = $1
       AND status = 'active'`,
    [userId]
  );
}

/**
 * Get payment history for a user.
 */
async function getPaymentHistory(userId) {
  const result = await query(
    `SELECT bp.razorpay_payment_id, bp.plan, bp.amount_paise, bp.paid_at,
            bo.razorpay_order_id
     FROM billing_payments bp
     JOIN billing_orders bo ON bo.id = bp.order_id
     WHERE bp.user_id = $1
     ORDER BY bp.paid_at DESC`,
    [userId]
  );
  return result.rows;
}

module.exports = {
  getAllPlanPrices,
  getPlanPrice,
  getSubscriptionByUserId,
  createOrder,
  getOrderByRazorpayId,
  fulfillPayment,
  failOrder,
  recordWebhookEvent,
  syncUserPlanState,
  cancelSubscriptionAtPeriodEnd,
  getPaymentHistory,
};
