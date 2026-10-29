import type { PrismaClient } from "@/generated/prisma/client";
import { deliverResendEmail } from "@/lib/mailer";
import { transactionalFromAddress } from "@/lib/marketing/emailConfig";

const SUBJECT = "Thank you for joining MicStage";

const BODY_TEXT = [
  "Thank you for joining MicStage.",
  "",
  "The site is completely free to use, with no hidden charges or surprises. Reply to this email if you have ideas or need help getting set up.",
  "",
  "Thanks,",
  "MicStage",
].join("\n");

/** Operational Reply-To only — never shown in the body and never paired with a personal name. */
const REPLY_TO = "drummer@micstage.com";

function fromForSignupThankYou(): { fromOverride: string; replyTo?: string } {
  return {
    fromOverride: transactionalFromAddress(),
    replyTo: REPLY_TO,
  };
}

function signupThankYouHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!DOCTYPE html><html><body style="font-family:Georgia,serif;font-size:16px;color:#111;line-height:1.5"><div style="white-space:pre-wrap">${esc(
    text,
  )}</div></body></html>`;
}

/**
 * Sends a single thank-you email after venue signup. Idempotent via `Venue.signupThankYouEmailSentAt`.
 * Brand-only voice. Failures are logged; signup must never depend on this.
 */
export async function sendVenueSignupThankYouEmailIfNeeded(
  prisma: PrismaClient,
  venueId: string,
  toEmail: string,
): Promise<void> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, signupThankYouEmailSentAt: true },
  });
  if (!venue || venue.signupThankYouEmailSentAt) return;

  const { fromOverride, replyTo } = fromForSignupThankYou();

  try {
    const out = await deliverResendEmail({
      to: toEmail,
      subject: SUBJECT,
      text: BODY_TEXT,
      html: signupThankYouHtml(BODY_TEXT),
      category: "transactional",
      fromOverride,
      replyTo,
      allowDevSkipWhenNoApiKey: true,
    });

    if (out.skipped) {
      console.warn("[venueSignupThankYouEmail] skipped (no Resend API key or dev skip); not marking sent", {
        venueId,
      });
      return;
    }

    const updated = await prisma.venue.updateMany({
      where: { id: venueId, signupThankYouEmailSentAt: null },
      data: { signupThankYouEmailSentAt: new Date() },
    });
    if (updated.count === 0) {
      console.warn("[venueSignupThankYouEmail] send succeeded but venue row was already marked", { venueId });
    }
  } catch (e) {
    console.error("[venueSignupThankYouEmail] send failed (signup continues)", { venueId, err: e });
  }
}
