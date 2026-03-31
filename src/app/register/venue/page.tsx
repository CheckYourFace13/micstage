export const metadata = {
  title: "Venue registration | MicStage",
};

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { registerVenue } from "./actions";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { VenuePlaceFields } from "./venuePlaceFields";

export default async function VenueRegisterPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const session = await getSession();
  if (session?.kind === "venue") redirect("/venue");

  const showRate = error === "rate";
  const showPlace = error === "place";
  const showUnavailable = error === "unavailable";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <a className="text-sm text-white/70 hover:text-white" href="/">
          ← Back
        </a>

        <h1 className="om-heading mt-6 text-4xl tracking-wide">Venue registration</h1>
        <p className="mt-2 text-sm text-white/70">
          Create your venue account. Next step will be creating your open mic schedule and publishing your page.
        </p>

        <form action={registerVenue} className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          {showPlace ? (
            <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white">
              Choose your venue from the Google suggestions dropdown before creating your account. If the map search
              does not load, confirm <span className="font-mono text-white/90">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> is
              set for this environment.
            </div>
          ) : null}
          {showRate ? (
            <div className="rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white">
              Too many signup attempts. Please try again later.
            </div>
          ) : null}
          {showUnavailable ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
              Registration could not complete. Check your connection and try again. If this keeps happening, contact support.
            </div>
          ) : null}
          <VenuePlaceFields />

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
              placeholder="Create a password"
              required
            />
          </label>

          <FormSubmitButton
            label="Create venue account"
            pendingLabel="Creating account…"
            className="mt-2 inline-flex h-11 min-w-[200px] items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-70"
          />
          <p className="text-xs text-white/50">
            This saves your venue using Google’s Place ID + coordinates, so maps and your public MicStage marketing pages
            reference the correct location (SEO-friendly URLs and listings).
          </p>
        </form>
      </main>
    </div>
  );
}
