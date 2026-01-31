import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpSecure = String(process.env.SMTP_SECURE || "true") === "true";

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Log a clear startup check if SMTP config is missing
if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.warn("[mailer] SMTP_USER or SMTP_PASS missing. Emails will fail.");
} else {
  console.log("[mailer] SMTP credentials loaded");
}

// Optional verification (non-blocking)
transporter.verify()
  .then(() => {
    console.log("[mailer] SMTP transporter verified");
  })
  .catch((err) => {
    console.warn("[mailer] SMTP verify failed:", err?.message || err);
  });

export async function sendResetEmail({ to, name, resetLink }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = "Reset your AafnoGhar password";
  const text = `Hello ${name || "there"},\n\nClick this link to reset your password:\n${resetLink}\n\nIf you didn’t request this, ignore this email.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6">
      <h2 style="margin:0 0 10px">Reset your password</h2>
      <p>Hello ${name || "there"},</p>
      <p>Click the button below to reset your password:</p>
      <p>
        <a href="${resetLink}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;">
          Reset Password
        </a>
      </p>
      <p style="color:#6b7280">If you didn’t request this, you can safely ignore this email.</p>
    </div>
  `;

  try {
    return await transporter.sendMail({ from, to, subject, text, html });
  } catch (err) {
    console.error("[mailer] sendResetEmail failed:", err?.response || err?.message || err);
    throw err;
  }
}
