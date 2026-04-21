export const metadata = {
  title: "Venue registration | MicStage",
};

import { redirect } from "next/navigation";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { getPrismaOrNull } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { VENUE_REGISTER_SUBMIT_PATH } from "./actions";
import { BetaNote } from "@/components/BetaNote";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { VenuePlaceFields } from "./venuePlaceFields";
import { LineupSlotTypesHelp } from "@/components/LineupSlotTypesHelp";
import { RegistrationContentConsent } from "@/components/RegistrationContentConsent";

const GROWTH_LEAD_ID_RE = /^c[a-z0-9]{24}$/i;

export default async function VenueRegisterPage(props: { searchParams: Promise<{ error?: string; growthLead?: string }> }) {
  const { error, growthLead } = await props.searchParams;
  const session = await getSession();
  if (session?.kind === "venue") redirect("/venue");

  const traceId = typeof growthLead === "string" && GROWTH_LEAD_ID_RE.test(growthLead.trim()) ? growthLead.trim() : "";
  if (traceId) {
    const prisma = getPrismaOrNull();
    if (prisma) {
      await advanceGrowthLeadAcquisitionStage(prisma, traceId, "CLICKED", { leadType: "VENUE" });
      await advanceGrowthLeadAcquisitionStage(prisma, traceId, "SIGNUP_STARTED", { leadType: "VENUE" });
    }
  }

  const showRate = error === "rate";
  const showPlace = error === "place";
  const showUnavailable = error === "unavailable";
  const showConsent = error === "consent";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <a className="text-sm text-white/70 hover:text-white" href="/">
          ← Back
        </a>

        <h1 className="om-heading mt-6 text-4xl tracking-wide">Venue registration</h1>
        <p className="mt-2 text-sm text-white/70">
          Create your venue account, set your open mic schedule, optionally require on-premises signups, then share your
          signup link on social media so performers can discover your venue.
        </p>
        {traceId ? (
          <div className="mt-4 rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white">
            <p className="font-medium text-white">You’re joining from MicStage outreach</p>
            <p className="mt-1 text-white/80">
              Claim your venue here so we can list your open mic, help performers find you, and give you tools to grow the
              night. Free to get started.
            </p>
          </div>
        ) : null}
        <BetaNote className="mt-3" />

        <form
          method="post"
          action={VENUE_REGISTER_SUBMIT_PATH}
          className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          {traceId ? <input type="hidden" name="growthTraceLeadId" value={traceId} /> : null}
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
          {showConsent ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
              Please confirm the agreement below (Terms, Privacy, and content use) to create your venue account.
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

          <RegistrationContentConsent />

          <FormSubmitButton
            label="Create venue account"
            pendingLabel="Creating account…"
            className="mt-2 inline-flex h-11 min-w-[200px] items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-70"
          />
          <p className="text-xs text-white/50">
            This saves your venue using Google’s Place ID and coordinates so maps, distance search, and your public MicStage
            pages all reference the correct location, which makes your open mic easier to find.
          </p>
          <LineupSlotTypesHelp className="mt-4" />
        </form>
      </main>
    </div>
  );
}
