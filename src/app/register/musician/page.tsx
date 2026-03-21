export const metadata = {
  title: "Artist registration | MicStage",
  alternates: {
    canonical: "https://micstage.com/register/musician",
  },
};

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { registerMusician } from "./actions";

export default async function MusicianRegisterPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const session = await getSession();
  if (session?.kind === "musician") redirect("/artist");

  const showRate = error === "rate";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <a className="text-sm text-white/70 hover:text-white" href="/">
          ← Back
        </a>

        <h1 className="om-heading mt-6 text-4xl tracking-wide">Artist registration</h1>
        <p className="mt-2 text-sm text-white/70">
          Create your performer account with <span className="text-white/90">email + password</span> (private). You’ll set
          a <span className="text-white/90">stage / performer name</span> that is{" "}
          <span className="text-emerald-200/90">public</span> — that’s what venues and fans see and how you show up in
          performer search.
        </p>

        <form action={registerMusician} className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          {showRate ? (
            <div className="rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white">
              Too many signup attempts. Please try again later.
            </div>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Stage / performer name</span>
            <input
              name="stageName"
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="Neon Wolves"
              required
            />
          </label>
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
            <span className="text-white/80">
              Password <span className="text-amber-200/80">(private)</span>
            </span>
            <input
              name="password"
              type="password"
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="Create a password"
              required
            />
          </label>

          <button
            type="submit"
            className="mt-2 inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Create artist account
          </button>
          <p className="text-xs text-white/50">After signup, you’ll be able to book slots and track your upcoming sets.</p>
        </form>
      </main>
    </div>
  );
}

