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
      throw new Error(
        "RESEND_API_KEY is missing in production. Set it and EMAIL_FROM (verified domain) so password resets can send.",
      );
    }
    // Dev fallback so flow still works without provider setup.
    console.log("EMAIL_FALLBACK", { ...input, appUrl: appUrl() });
    return;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: fromEmail(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}

