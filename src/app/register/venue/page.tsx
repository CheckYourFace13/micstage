import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { getPrismaOrNull } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { VENUE_REGISTER_SUBMIT_PATH } from "./actions";
import { VenueSetupRequestForm } from "@/components/register/VenueSetupRequestForm";
import { RegistrationFunnelTracker } from "@/components/register/RegistrationFunnelTracker";
import { RegistrationFormPersist } from "@/components/register/RegistrationFormPersist";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { RegistrationContentConsent } from "@/components/RegistrationContentConsent";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Create your free venue account",
  description:
    "Create a free MicStage venue account in under a minute. No credit card. Connect your venue after signup.",
  path: "/register/venue",
});

const GROWTH_LEAD_ID_RE = /^c[a-z0-9]{24}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export default async function VenueRegisterPage(props: {
  searchParams: Promise<{
    error?: string;
    growthLead?: string;
    claimListing?: string;
    email?: string;
  }>;
}) {
  const { error, growthLead, claimListing, email: emailParam } = await props.searchParams;
  const session = await getSession();
  if (session?.kind === "venue") {
    const setupQs = new URLSearchParams();
    if (typeof claimListing === "string" && SLUG_RE.test(claimListing.trim())) {
      setupQs.set("claimListing", claimListing.trim());
    }
    if (typeof growthLead === "string" && GROWTH_LEAD_ID_RE.test(growthLead.trim())) {
      setupQs.set("growthLead", growthLead.trim());
    }
    const q = setupQs.toString();
    redirect(q ? `/venue/setup?${q}` : "/venue/setup");
  }

  const traceId = typeof growthLead === "string" && GROWTH_LEAD_ID_RE.test(growthLead.trim()) ? growthLead.trim() : "";
  const claimSlug =
    typeof claimListing === "string" && SLUG_RE.test(claimListing.trim()) ? claimListing.trim() : "";
  const prefillEmail = typeof emailParam === "string" ? emailParam.trim().toLowerCase() : "";

  if (traceId) {
    const prisma = getPrismaOrNull();
    if (prisma) {
      await advanceGrowthLeadAcquisitionStage(prisma, traceId, "CLICKED", { leadType: "VENUE" });
      await advanceGrowthLeadAcquisitionStage(prisma, traceId, "SIGNUP_STARTED", { leadType: "VENUE" });
    }
  }

  const showRate = error === "rate";
  const showUnavailable = error === "unavailable";
  const showConsent = error === "consent";
  const showExists = error === "exists";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <RegistrationFunnelTracker role="venue" />
        <Link className="text-sm text-white/70 hover:text-white" href="/">
          &lt;- Back
        </Link>

        <h1 className="om-heading mt-4 text-3xl tracking-wide sm:text-4xl">Create your free venue account</h1>
        <p className="mt-2 text-sm text-white/70">Takes less than a minute. No credit card. Connect your venue after signup.</p>
        {claimSlug ? (
          <p className="mt-2 text-sm text-emerald-100/90">After your account is created, we&apos;ll help you connect this listing.</p>
        ) : null}
        {traceId ? (
          <div className="mt-4 rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white">
            <p className="font-medium text-white">You are joining from MicStage outreach</p>
            <p className="mt-1 text-white/80">Create your free account first — then claim your venue.</p>
          </div>
        ) : null}

        <form
          id="venue-register-form"
          method="post"
          action={VENUE_REGISTER_SUBMIT_PATH}
          className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6"
        >
          <RegistrationFormPersist formId="venue-register-form" />
          {traceId ? <input type="hidden" name="growthTraceLeadId" value={traceId} /> : null}
          {claimSlug ? <input type="hidden" name="claimListing" value={claimSlug} /> : null}
          {showExists ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
              Looks like you already have an account —{" "}
              <Link className="font-semibold text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/login/venue">
                sign in
              </Link>
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
              Please confirm the agreement below to create your venue account.
            </div>
          ) : null}

          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Email</span>
            <input
              name="email"
              type="email"
              defaultValue={prefillEmail}
              className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white placeholder:text-white/40"
              placeholder="owner@venue.com"
              required
              autoComplete="email"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Password</span>
            <input
              name="password"
              type="password"
              className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white placeholder:text-white/40"
              placeholder="Create a password"
              required
              autoComplete="new-password"
            />
          </label>

          <RegistrationContentConsent />

          <FormSubmitButton
            label="Create free account"
            pendingLabel="Creating account..."
            className="mt-2 inline-flex h-12 min-w-[200px] items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-base font-semibold text-black hover:brightness-110 disabled:opacity-70"
          />
          <p className="text-center text-xs text-white/50">Free account. No credit card.</p>
        </form>

        <div className="mt-6">
          <VenueSetupRequestForm />
        </div>
      </main>
    </div>
  );
}
