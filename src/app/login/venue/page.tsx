export const metadata = {
  title: "Venue login | MicStage",
};

import { loginVenue } from "./serverActions";

export default async function VenueLoginPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const showInvalid = error === "invalid";
  const showRate = error === "rate";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <a className="text-sm text-white/70 hover:text-white" href="/">
          ← Back
        </a>

        <h1 className="om-heading mt-6 text-4xl tracking-wide">Venue login</h1>
        <p className="mt-2 text-sm text-white/70">Log in to manage your venue schedule and invite managers.</p>

        <form action={loginVenue} className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
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

          <button
            type="submit"
            className="mt-2 inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
          >
            Log in
          </button>

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
        </form>
      </main>
    </div>
  );
}

