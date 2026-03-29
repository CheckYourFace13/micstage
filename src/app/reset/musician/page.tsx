import { FormSubmitButton } from "@/components/FormSubmitButton";
import { requestMusicianPasswordReset } from "./actions";

export const metadata = {
  title: "Reset artist password | MicStage",
};

export default async function ResetMusicianPasswordPage(props: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await props.searchParams;
  const showRate = error === "rate";
  const showInvalidToken = error === "invalidToken";
  const showSent = sent === "1";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <a className="text-sm text-white/70 hover:text-white" href="/login/musician">
          ← Back to login
        </a>

        <h1 className="om-heading mt-6 text-4xl tracking-wide">Reset password</h1>
        <p className="mt-2 text-sm text-white/70">Artists can request a secure reset link by email.</p>

        <form action={requestMusicianPasswordReset} className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          {showRate ? (
            <div className="rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white">
              Too many reset attempts. Please wait and try again.
            </div>
          ) : null}
          {showInvalidToken ? (
            <div className="rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white">
              Reset link is invalid or expired. Request a new one below.
            </div>
          ) : null}
          {showSent ? (
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
              If the email exists, a reset link has been sent.
            </div>
          ) : null}

          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Email</span>
            <input
              name="email"
              type="email"
              required
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="you@example.com"
            />
          </label>

          <FormSubmitButton
            label="Send reset link"
            pendingLabel="Sending…"
            className="mt-2 inline-flex h-11 min-w-[160px] items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          />

          <p className="text-xs text-white/50">In development without email provider setup, reset links are logged to server console.</p>
        </form>
      </main>
    </div>
  );
}

