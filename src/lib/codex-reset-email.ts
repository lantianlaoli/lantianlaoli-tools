import { DEFAULT_CODEX_RESET_EMAIL_RECIPIENTS } from "./codex-reset-notifier";
import { sendEmail } from "./resend";
import type { CodexResetNotice } from "./types";

const EMAIL_RECIPIENT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value
    .map((item) => String(item).trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

export function normalizeCodexResetEmailRecipients(value: unknown): string[] {
  return normalizeList(value, DEFAULT_CODEX_RESET_EMAIL_RECIPIENTS)
    .map((email) => email.toLowerCase())
    .filter((email) => EMAIL_RECIPIENT_PATTERN.test(email));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "\"") return "&quot;";
    return "&#39;";
  });
}

function formatNoticeTime(value: string) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

export function buildCodexResetEmailContent(notices: CodexResetNotice[]) {
  const subject = notices.length === 1
    ? `Codex reset notice from @${notices[0].username}`
    : `${notices.length} Codex reset notices`;
  const itemsHtml = notices.map((notice) => `
    <li style="margin:0 0 20px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;">
      <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">
        <strong>@${escapeHtml(notice.username)}</strong>
        <span style="color:#9ca3af;">${escapeHtml(formatNoticeTime(notice.createdAt))}</span>
      </p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#111827;white-space:pre-wrap;">${escapeHtml(notice.text)}</p>
      <p style="margin:0;font-size:14px;">
        <a href="${escapeHtml(notice.url)}" style="color:#2563eb;text-decoration:underline;">Open on X</a>
      </p>
    </li>
  `).join("");
  const html = `<!doctype html>
    <html>
      <body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
        <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
          <h1 style="margin:0 0 16px;font-size:24px;color:#111827;">Codex Reset Reminder</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">
            New reset-related X posts were detected by your Codex Reset Notifier.
          </p>
          <ul style="list-style:none;margin:0;padding:0;">${itemsHtml}</ul>
        </div>
      </body>
    </html>`;
  const text = [
    "Codex Reset Reminder",
    "",
    "New reset-related X posts were detected.",
    "",
    ...notices.flatMap((notice, index) => [
      `${index + 1}. @${notice.username} - ${formatNoticeTime(notice.createdAt)}`,
      notice.text,
      notice.url,
      "",
    ]),
  ].join("\n");

  return { subject, html, text };
}

export async function sendCodexResetNoticeEmail(options: {
  recipients: unknown;
  notices: CodexResetNotice[];
}) {
  const recipients = normalizeCodexResetEmailRecipients(options.recipients);
  if (recipients.length === 0) {
    throw new Error("At least one valid email recipient is required.");
  }
  if (options.notices.length === 0) {
    throw new Error("At least one notice is required.");
  }

  const content = buildCodexResetEmailContent(options.notices);
  return sendEmail({
    to: recipients,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });
}
