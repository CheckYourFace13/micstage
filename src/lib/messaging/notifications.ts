import { sendEmail } from "@/lib/mailer";
import { absoluteUrl } from "@/lib/publicSeo";

export async function notifyNewMessageEmail(opts: {
  to: string;
  recipientLabel: string;
  senderLabel: string;
  threadUrl: string;
  preview: string;
}): Promise<void> {
  const { to, recipientLabel, senderLabel, threadUrl, preview } = opts;
  const abs = threadUrl.startsWith("http") ? threadUrl : absoluteUrl(threadUrl);
  const clipped = preview.length > 180 ? `${preview.slice(0, 177)}…` : preview;
  const subject = `New message on MicStage from ${senderLabel}`;
  const text = `Hi ${recipientLabel},

You have a new message on MicStage from ${senderLabel}.

"${clipped}"

Open your conversation (read and reply on MicStage, not by replying to this email):
${abs}

— MicStage`;
  const html = `<p>Hi ${escapeHtml(recipientLabel)},</p>
<p>You have a new message on MicStage from <strong>${escapeHtml(senderLabel)}</strong>.</p>
<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid rgb(255,45,149);background:#f9f9f9;color:#222;">${escapeHtml(clipped)}</blockquote>
<p><a href="${escapeHtml(abs)}">Open conversation on MicStage</a></p>
<p style="font-size:12px;color:#666;">Replies belong on MicStage — this email is just a heads-up.</p>
<p style="font-size:12px;color:#666;">— MicStage</p>`;
  try {
    await sendEmail({ to, subject, text, html });
  } catch (e) {
    console.error("[messaging] notify email failed", e);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
