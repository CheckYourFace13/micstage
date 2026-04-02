export const metadata = {
  title: "Venue login | MicStage",
};

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { safeAfterAuthPath } from "@/lib/safeRedirect";
import { loginVenue } from "./serverActions";
import { BetaNote } from "@/components/BetaNote";
import { VenueLoginForm } from "./VenueLoginForm";

export default async function VenueLoginPage(props: {
  searchParams: Promise<{ error?: string; next?: string; reset?: string }>;
}) {
  const { error, next, reset } = await props.searchParams;
  const session = await getSession();
  if (session?.kind === "venue") {
    redirect(safeAfterAuthPath(next, "/venue"));
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

        <h1 className="om-heading mt-6 text-4xl tracking-wide">Venue login</h1>
        <p className="mt-2 text-sm text-white/70">Log in to manage your venue schedule and invite managers.</p>
        <BetaNote className="mt-3" />

        <VenueLoginForm
          action={loginVenue}
          next={next ?? ""}
          footer={
            <div className="text-xs text-white/60">
              Forgot password?{" "}
              <a className="underline hover:text-white" href="/reset/venue">
                Reset it
              </a>
              .<br />
              New venue?{" "}
              <a className="underline hover:text-white" href="/register/venue">
                Create an account
              </a>
              .
            </div>
          }
        >
          {showResetSuccess ? (
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
              Password updated successfully. You can log in now.
            </div>
          ) : null}
          {showInvalid ? (
            <div className="rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white">
              Invalid email or password.{" "}
              <a className="underline hover:text-white" href="/reset/venue">
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
              placeholder="owner@venue.com"
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
        </VenueLoginForm>
      </main>
    </div>
  );
}

