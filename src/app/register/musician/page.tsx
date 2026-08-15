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
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Artist registration",
  description:
    "Create your MicStage artist account with email and password. Set a public stage name, find open mics, and book slots.",
  path: "/register/musician",
});

const GROWTH_LEAD_ID_RE = /^c[a-z0-9]{24}$/i;

export default async function MusicianRegisterPage(props: {
  searchParams: Promise<{ error?: string; growthLead?: string; next?: string }>;
}) {
  const { error, growthLead, next: nextRaw } = await props.searchParams;
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

  const showRate = error === "rate";
  const showUnavailable = error === "unavailable";
  const showConsent = error === "consent";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <Link className="text-sm text-white/70 hover:text-white" href={returnNext || "/"}>
          &lt;- Back
        </Link>

        <h1 className="om-heading mt-6 text-3xl tracking-wide sm:text-4xl">Create your free performer account</h1>
        <p className="mt-2 text-sm text-white/70">
          Just a display name, email, and password. Find open mics and build your profile after you&apos;re in.
        </p>
        {returnNext ? (
          <p className="mt-2 text-sm text-emerald-100/90">After you create your account, we&apos;ll bring you right back.</p>
        ) : null}

        <form
          method="post"
          action={MUSICIAN_REGISTER_SUBMIT_PATH}
          className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          {traceId ? <input type="hidden" name="growthTraceLeadId" value={traceId} /> : null}
          {returnNext ? <input type="hidden" name="next" value={returnNext} /> : null}
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
            <span className="text-white/80">Display name</span>
            <input
              name="stageName"
              className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white placeholder:text-white/40"
              placeholder="How you want to appear"
              required
              autoComplete="nickname"
            />
            <span className="text-xs text-white/50">You can change this anytime. Bio, photo, and genres come later.</span>
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
            label="Create account"
            pendingLabel="Creating…"
            className="mt-2 inline-flex h-12 min-w-[200px] items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-base font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          />
        </form>
      </main>
    </div>
  );
}

