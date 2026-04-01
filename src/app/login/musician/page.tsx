export const metadata = {
  title: "Artist login | MicStage",
};

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { safeAfterMusicianLoginPath } from "@/lib/safeRedirect";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { loginMusician } from "./serverActions";

export default async function MusicianLoginPage(props: {
  searchParams: Promise<{ error?: string; next?: string; reset?: string }>;
}) {
  const { error, next, reset } = await props.searchParams;
  const session = await getSession();
  if (session?.kind === "musician") {
    redirect(safeAfterMusicianLoginPath(next));
  }

  const showInvalid = error === "invalid";
  const showRate = error === "rate";
  const showUnavailable = error === "unavailable";
  const showResetSuccess = reset === "success";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <a className="text-sm text-white/70 hover:text-white" href="/">
          ← Back
        </a>

        <h1 className="om-heading mt-6 text-4xl tracking-wide">Artist login</h1>
        <p className="mt-2 text-sm text-white/70">
          Sign in with your <span className="text-white/90">email and password</span>. Your{" "}
          <span className="text-emerald-200/90">stage name</span> is what others see on MicStage and in{" "}
          <a className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/performers">
            artist search
          </a>{" "}
          — not your legal name.
        </p>

        <form action={loginMusician} className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          <input type="hidden" name="next" value={next ?? ""} />
          {showResetSuccess ? (
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
              Password updated successfully. You can log in now.
            </div>
          ) : null}
          {showInvalid ? (
            <div className="rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white">
              Invalid email or password.{" "}
              <a className="underline hover:text-white" href="/reset/musician">
                Reset password
              </a>
              .
            </div>
          ) : null}
          {showRate ? (
            <div className="rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white">
              Too many attempts. Please wait and try again.
            </div>
          ) : null}
          {showUnavailable ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
              Sign-in is temporarily unavailable. Check your connection and try again. If this keeps happening, contact support.
            </div>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Email</span>
            <input
              name="email"
              type="email"
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="you@example.com"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Password</span>
            <input
              name="password"
              type="password"
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="Your password"
              required
            />
          </label>

          <FormSubmitButton
            label="Log in"
            pendingLabel="Signing in…"
            className="mt-2 inline-flex h-11 min-w-[120px] items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          />

          <div className="text-xs text-white/60">
            Forgot password?{" "}
            <a className="underline hover:text-white" href="/reset/musician">
              Reset it
            </a>
            .<br />
            New artist?{" "}
            <a className="underline hover:text-white" href="/register/musician">
              Create an account
            </a>
            .
          </div>
        </form>
      </main>
    </div>
  );
}

