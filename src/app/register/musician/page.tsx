import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { getPrismaOrNull } from "@/lib/prisma";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { getSession } from "@/lib/session";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { MUSICIAN_REGISTER_SUBMIT_PATH } from "./actions";
import { RegistrationContentConsent } from "@/components/RegistrationContentConsent";
import { RegistrationFunnelTracker } from "@/components/register/RegistrationFunnelTracker";
import { RegistrationFormPersist } from "@/components/register/RegistrationFormPersist";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Create your free performer account",
  description:
    "Create your free MicStage performer account with stage name, email, and password. Takes less than a minute.",
  path: "/register/musician",
});

const GROWTH_LEAD_ID_RE = /^c[a-z0-9]{24}$/i;

export default async function MusicianRegisterPage(props: {
  searchParams: Promise<{ error?: string; growthLead?: string; next?: string; email?: string; stageName?: string }>;
}) {
  const { error, growthLead, next: nextRaw, email: emailParam, stageName: stageParam } = await props.searchParams;
  const session = await getSession();
  if (session?.kind === "musician") redirect(ARTIST_DASHBOARD_HREF);

  const returnNext =
    typeof nextRaw === "string" && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw.trim() : "";

  const traceId = typeof growthLead === "string" && GROWTH_LEAD_ID_RE.test(growthLead.trim()) ? growthLead.trim() : "";
  if (traceId) {
    const prisma = getPrismaOrNull();
    if (prisma) {
      await advanceGrowthLeadAcquisitionStage(prisma, traceId, "CLICKED", { leadType: "ARTIST" });
      await advanceGrowthLeadAcquisitionStage(prisma, traceId, "SIGNUP_STARTED", { leadType: "ARTIST" });
    }
  }

  const prefillEmail = typeof emailParam === "string" ? emailParam.trim().toLowerCase() : "";
  const prefillStage = typeof stageParam === "string" ? stageParam.trim().slice(0, 80) : "";
  const showRate = error === "rate";
  const showUnavailable = error === "unavailable";
  const showConsent = error === "consent";
  const showExists = error === "exists";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <RegistrationFunnelTracker role="performer" />
        <Link className="text-sm text-white/70 hover:text-white" href={returnNext || "/"}>
          &lt;- Back
        </Link>

        <h1 className="om-heading mt-4 text-3xl tracking-wide sm:text-4xl">Create your free performer account</h1>
        <p className="mt-2 text-sm text-white/70">Takes less than a minute. No credit card.</p>
        {returnNext ? (
          <p className="mt-2 text-sm text-emerald-100/90">After you create your account, we&apos;ll bring you right back.</p>
        ) : null}

        <form
          id="performer-register-form"
          method="post"
          action={MUSICIAN_REGISTER_SUBMIT_PATH}
          className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6"
        >
          <RegistrationFormPersist formId="performer-register-form" />
          {traceId ? <input type="hidden" name="growthTraceLeadId" value={traceId} /> : null}
          {returnNext ? <input type="hidden" name="next" value={returnNext} /> : null}
          {showExists ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
              Looks like you already have an account —{" "}
              <Link
                className="font-semibold text-[rgb(var(--om-neon))] underline hover:brightness-110"
                href={returnNext ? `/login/musician?next=${encodeURIComponent(returnNext)}` : "/login/musician"}
              >
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
              Please confirm the agreement below to create your account.
            </div>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Stage name</span>
            <input
              name="stageName"
              defaultValue={prefillStage}
              className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white placeholder:text-white/40"
              placeholder="How you want to appear"
              required
              autoComplete="nickname"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Email</span>
            <input
              name="email"
              type="email"
              defaultValue={prefillEmail}
              className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white placeholder:text-white/40"
              placeholder="you@example.com"
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
            label="Create free performer account"
            pendingLabel="Creating…"
            className="mt-2 inline-flex h-12 min-w-[200px] items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-base font-semibold text-black hover:brightness-110 disabled:opacity-60"
          />
          <p className="text-center text-xs text-white/50">Free account. No credit card.</p>
        </form>

        <p className="mt-6 text-center text-sm text-white/55">
          Already have an account?{" "}
          <Link className="underline hover:text-white" href="/login/musician">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
