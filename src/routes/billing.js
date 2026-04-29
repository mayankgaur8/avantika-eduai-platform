"use strict";

const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { authMiddleware } = require("../middleware/auth");
const {
  getAllPlanPrices,
  getPlanPrice,
  getSubscriptionByUserId,
  createOrder,
  getOrderByRazorpayId,
  fulfillPayment,
  failOrder,
  recordWebhookEvent,
  cancelSubscriptionAtPeriodEnd,
  getPaymentHistory,
} = require("../db/billingQueries");

const router = express.Router();

// ── Razorpay client ──────────────────────────────────────────────────────────

const hasRazorpayApiConfig =
  Boolean(process.env.RAZORPAY_KEY_ID) && Boolean(process.env.RAZORPAY_KEY_SECRET);

const razorpay = hasRazorpayApiConfig
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

if (!hasRazorpayApiConfig) {
  console.warn(
    "[Billing] Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable billing APIs."
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Verifies the Razorpay payment signature.
 * Signature = HMAC-SHA256(orderId + "|" + paymentId, keySecret)
 */
function verifySignature(razorpayOrderId, razorpayPaymentId, signature) {
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return false;
  }

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ── GET /api/billing/plans ───────────────────────────────────────────────────
// Returns all plans with prices — used to render the pricing page.
router.get("/plans", async (req, res) => {
  const plans = await getAllPlanPrices();
  return res.json({ success: true, data: plans });
});

// ── POST /api/billing/order ──────────────────────────────────────────────────
// Creates a Razorpay order for the requested plan.
// Requires: authenticated user (req.user set by auth middleware)
//
// Body: { plan: "teacher" | "institute" | "school" }
router.post("/order", authMiddleware, async (req, res) => {
  if (!razorpay) {
    return res.status(503).json({
      success: false,
      error: "Billing is not configured. Missing Razorpay credentials.",
    });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorised" });
  }

  const { plan } = req.body;
  if (!plan || plan === "free") {
    return res.status(400).json({ success: false, error: "Invalid plan selected." });
  }

  const planPrice = await getPlanPrice(plan);
  if (!planPrice) {
    return res.status(400).json({ success: false, error: "Plan not found." });
  }

  try {
    // Create order in Razorpay
    const rzpOrder = await razorpay.orders.create({
      amount: planPrice.amount_paise,
      currency: planPrice.currency,
      receipt: `avantika_${userId.slice(0, 8)}_${Date.now()}`,
      notes: { userId, plan },
    });

    // Persist order in DB
    const dbOrder = await createOrder(userId, rzpOrder.id, plan, planPrice.amount_paise);

    return res.status(201).json({
      success: true,
      data: {
        orderId: rzpOrder.id,
        amount: planPrice.amount_paise,
        currency: planPrice.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        plan,
        displayName: planPrice.display_name,
        dbOrderId: dbOrder.id,
      },
    });
  } catch (err) {
    console.error("[Razorpay Order Error]", err.message);
    return res.status(500).json({ success: false, error: "Could not create payment order." });
  }
});

// ── POST /api/billing/verify ─────────────────────────────────────────────────
// Called from the frontend after Razorpay checkout completes successfully.
// Verifies the signature and upgrades the user's plan.
//
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
router.post("/verify", authMiddleware, async (req, res) => {
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({
      success: false,
      error: "Billing is not configured. Missing Razorpay signature secret.",
    });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorised" });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, error: "Missing payment fields." });
  }

  // 1. Verify HMAC signature
  const isValid = verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) {
    return res.status(400).json({ success: false, error: "Payment signature invalid." });
  }

  // 2. Look up the order
  const order = await getOrderByRazorpayId(razorpay_order_id);
  if (!order || order.user_id !== userId) {
    return res.status(404).json({ success: false, error: "Order not found." });
  }

  if (order.status === "paid") {
    return res.json({ success: true, message: "Already activated.", plan: order.plan });
  }

  // 3. Fulfill — update order, record payment, upgrade plan
  try {
    const planPrice = await getPlanPrice(order.plan);
    const result = await fulfillPayment({
      orderId: order.id,
      userId,
      plan: order.plan,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      amountPaise: order.amount_paise,
      billingCycle: planPrice?.billing_cycle || "monthly",
    });

    return res.json({
      success: true,
      message: result.alreadyProcessed ? "Already activated." : "Payment verified. Plan upgraded!",
      plan: order.plan,
    });
  } catch (err) {
    console.error("[Verify Fulfill Error]", err.message);
    return res.status(500).json({ success: false, error: "Failed to activate plan." });
  }
});

// ── POST /api/billing/webhook ────────────────────────────────────────────────
// Razorpay webhook — handles async events (payment.failed, etc.)
// Set this URL in Razorpay Dashboard → Webhooks.
// IMPORTANT: must receive raw body for signature verification.
router.post(
  "/webhook",
  express.raw({ type: "application/json" }), // override JSON middleware for raw body
  async (req, res) => {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      return res.status(503).json({
        success: false,
        error: "Billing webhook is not configured.",
      });
    }

    const signature = req.headers["x-razorpay-signature"];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Verify webhook signature
    const expected = crypto
      .createHmac("sha256", secret)
      .update(req.body)
      .digest("hex");

    if (expected !== signature) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const event = JSON.parse(req.body.toString());
    const eventType = event.event;
    const payload = event.payload?.payment?.entity || event.payload?.order?.entity;
    const isNewEvent = await recordWebhookEvent(event.id, eventType, event.payload || {});
    if (!isNewEvent) {
      return res.json({ received: true, deduplicated: true });
    }

    try {
      switch (eventType) {
        case "payment.captured": {
          // Secondary safety net — /verify is the primary fulfillment path.
          // Only act if order is still in 'created' state.
          const order = await getOrderByRazorpayId(payload.order_id);
          if (order && order.status === "created") {
            const planPrice = await getPlanPrice(order.plan);
            await fulfillPayment({
              orderId: order.id,
              userId: order.user_id,
              plan: order.plan,
              razorpayPaymentId: payload.id,
              razorpaySignature: "webhook",
              amountPaise: order.amount_paise,
              billingCycle: planPrice?.billing_cycle || "monthly",
            });
          }
          break;
        }

        case "payment.failed": {
          if (payload?.order_id) {
            await failOrder(payload.order_id);
          }
          break;
        }

        default:
          // Unhandled event — acknowledge and ignore
          break;
      }

      return res.json({ received: true });
    } catch (err) {
      console.error("[Webhook Error]", eventType, err.message);
      // Return 200 so Razorpay doesn't retry indefinitely
      return res.json({ received: true, warning: "Processing error" });
    }
  }
);

// ── GET /api/billing/subscription ───────────────────────────────────────────
router.get("/subscription", authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: "Unauthorised" });
  const subscription = await getSubscriptionByUserId(userId);
  return res.json({ success: true, data: subscription });
});

// ── GET /api/billing/history ─────────────────────────────────────────────────
router.get("/history", async (req, res) => {
  return authMiddleware(req, res, async () => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorised" });
  }

  const payments = await getPaymentHistory(userId);
  return res.json({ success: true, data: payments });
  });
});

router.post("/cancel", authMiddleware, async (req, res) => {
  try {
    await cancelSubscriptionAtPeriodEnd(req.user.id);
    return res.json({ success: true, message: "Subscription will downgrade at the end of the current billing period." });
  } catch (err) {
    console.error("[Billing Cancel Error]", err.message);
    return res.status(500).json({ success: false, error: "Failed to update subscription." });
  }
});

module.exports = router;
