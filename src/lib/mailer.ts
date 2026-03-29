import { Resend } from "resend";

function appUrl() {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function fromEmail() {
  return process.env.EMAIL_FROM || "MicStage <onboarding@resend.dev>";
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      const msg =
        "RESEND_API_KEY is missing in production. Set it and EMAIL_FROM (verified domain) so password resets can send.";
      console.error("[mailer]", msg, { toDomain: input.to.split("@")[1] ?? "?" });
      throw new Error(msg);
    }
    console.log("[mailer] EMAIL_FALLBACK (no RESEND_API_KEY)", {
      to: input.to,
      subject: input.subject,
      appUrl: appUrl(),
    });
    return;
  }

  const fromAddr = fromEmail();
  if (!fromAddr || fromAddr.includes("onboarding@resend.dev")) {
    console.warn(
      "[mailer] EMAIL_FROM not set or still resend.dev default; production sends often fail domain verification.",
      { from: fromAddr },
    );
  }

  const resend = new Resend(apiKey);
  try {
    const { error } = await resend.emails.send({
      from: fromAddr,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) {
      console.error("[mailer] Resend API rejected send", {
        message: error.message,
        name: error.name,
        toDomain: input.to.split("@")[1] ?? "?",
      });
      throw new Error(`Resend: ${error.message}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[mailer] send failed", { message, toDomain: input.to.split("@")[1] ?? "?" });
    throw e;
  }
}
