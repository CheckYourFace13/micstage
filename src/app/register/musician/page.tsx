import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { getSession } from "@/lib/session";
import { BetaNote } from "@/components/BetaNote";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { MUSICIAN_REGISTER_SUBMIT_PATH } from "./actions";
import { LineupSlotTypesHelp } from "@/components/LineupSlotTypesHelp";
import { RegistrationContentConsent } from "@/components/RegistrationContentConsent";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Artist registration",
  description:
    "Create your MicStage artist account with email and password. Set a public stage name, find open mics, and book slots.",
  path: "/register/musician",
});

export default async function MusicianRegisterPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const session = await getSession();
  if (session?.kind === "musician") redirect(ARTIST_DASHBOARD_HREF);

  const showRate = error === "rate";
  const showUnavailable = error === "unavailable";
  const showConsent = error === "consent";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <Link className="text-sm text-white/70 hover:text-white" href="/">
          &lt;- Back
        </Link>

        <h1 className="om-heading mt-6 text-4xl tracking-wide">Artist registration</h1>
        <p className="mt-2 text-sm text-white/70">
          Create your artist account with <span className="text-white/90">email + password</span> (private). You will set a{" "}
          <span className="text-white/90">stage name</span> that is <span className="text-emerald-200/90">public</span>. That is
          what venues and fans see, and how you show up in artist search.
        </p>
        <BetaNote className="mt-3" />

        <form
          method="post"
          action={MUSICIAN_REGISTER_SUBMIT_PATH}
          className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6"
        >
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
          {showConsent ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
              Please confirm the agreement below (Terms, Privacy, and content use) to create your account.
            </div>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Stage name</span>
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

          <RegistrationContentConsent />

          <FormSubmitButton
            label="Create artist account"
            pendingLabel="Creating account..."
            className="mt-2 inline-flex h-11 min-w-[200px] items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          />
          <p className="text-xs text-white/50">After signup, you will be able to book slots and track your upcoming sets.</p>
          <LineupSlotTypesHelp className="mt-4" />
        </form>
      </main>
    </div>
  );
}

