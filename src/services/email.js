const crypto = require("crypto");
const { query, transaction } = require("../db/client");

let Resend = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  if (!Resend) {
    try {
      ({ Resend } = require("resend"));
    } catch {
      return null;
    }
  }

  return new Resend(apiKey);
}

function getBaseUrl() {
  return (process.env.CLIENT_URL || process.env.APP_URL || "").trim().replace(/\/$/, "");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function sendEmail({ to, subject, html }) {
  const client = getResendClient();
  const from = process.env.EMAIL_FROM?.trim();
  if (!client || !from) {
    return { sent: false, skipped: true };
  }

  await client.emails.send({ from, to, subject, html });
  return { sent: true };
}

async function sendWelcomeEmail({ email, name }) {
  return sendEmail({
    to: email,
    subject: "Welcome to Avantika EduAI",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
        <h1 style="margin:0 0 12px;font-size:24px;">Welcome to Avantika EduAI</h1>
        <p style="font-size:16px;line-height:1.6;">Hi ${name || "there"},</p>
        <p style="font-size:16px;line-height:1.6;">Your account is ready. You can start generating papers, quizzes, and CAT practice sessions immediately.</p>
        <p style="font-size:16px;line-height:1.6;">If you are preparing for CAT, head straight to the CAT hub for mocks, analytics, and AI Tutor.</p>
      </div>
    `,
  });
}

async function issueEmailVerification(userId, email, name) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await transaction(async (client) => {
    await client.query(
      `DELETE FROM email_verification_tokens WHERE user_id = $1 AND consumed_at IS NULL`,
      [userId]
    );
    await client.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  });

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return { sent: false, skipped: true };
  }

  const verifyUrl = `${baseUrl}/verify-email?token=${token}`;
  return sendEmail({
    to: email,
    subject: "Verify your Avantika EduAI email",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
        <h1 style="margin:0 0 12px;font-size:24px;">Verify your email</h1>
        <p style="font-size:16px;line-height:1.6;">Hi ${name || "there"},</p>
        <p style="font-size:16px;line-height:1.6;">Confirm your email to improve account recovery and billing trust.</p>
        <p style="margin:24px 0;">
          <a href="${verifyUrl}" style="background:#4f46e5;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600;">Verify Email</a>
        </p>
        <p style="font-size:13px;line-height:1.6;color:#6b7280;">This link expires in 24 hours.</p>
      </div>
    `,
  });
}

async function verifyEmailToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  return transaction(async (client) => {
    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM email_verification_tokens
       WHERE token_hash = $1
         AND consumed_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );

    if (!tokenResult.rows.length) {
      return { verified: false };
    }

    const tokenRow = tokenResult.rows[0];
    await client.query(
      `UPDATE email_verification_tokens SET consumed_at = NOW() WHERE id = $1`,
      [tokenRow.id]
    );
    await client.query(
      `UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1`,
      [tokenRow.user_id]
    );

    return { verified: true, userId: tokenRow.user_id };
  });
}

module.exports = {
  sendWelcomeEmail,
  issueEmailVerification,
  verifyEmailToken,
};