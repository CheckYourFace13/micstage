import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PROMOTER_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { getSession } from "@/lib/session";
import { getPrismaOrNull } from "@/lib/prisma";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { RegistrationContentConsent } from "@/components/RegistrationContentConsent";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { PROMOTER_REGISTER_SUBMIT_PATH } from "./actions";

export const metadata: Metadata = buildPublicMetadata({
  title: "Create your promoter account",
  description: "Finish creating your MicStage promoter account after approval — name, email, and password only.",
  path: "/register/promoter",
});

export default async function PromoterRegisterPage(props: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const { error, email: emailParam } = await props.searchParams;
  const session = await getSession();
  if (session?.kind === "promoter") redirect(PROMOTER_DASHBOARD_HREF);

  const prefillEmail = typeof emailParam === "string" ? emailParam.trim().toLowerCase() : "";
  let approvedHint: { contactName: string; brandName: string | null } | null = null;
  if (prefillEmail) {
    const prisma = getPrismaOrNull();
    if (prisma) {
      const app = await prisma.promoterApplication.findFirst({
        where: { email: prefillEmail, status: "APPROVED" },
        orderBy: { reviewedAt: "desc" },
        select: { contactName: true, brandName: true },
      });
      if (app) approvedHint = app;
    }
  }

  const showRate = error === "rate";
  const showUnavailable = error === "unavailable";
  const showConsent = error === "consent";
  const showNotApproved = error === "notApproved";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6 sm:py-16">
        <Link className="text-sm text-white/70 hover:text-white" href="/">
          &lt;- Back
        </Link>

        <h1 className="om-heading mt-6 text-3xl tracking-wide sm:text-4xl">Create your account</h1>
        <p className="mt-2 text-sm text-white/70">
          {approvedHint
            ? `Welcome${approvedHint.contactName ? `, ${approvedHint.contactName.split(/\s+/)[0]}` : ""}! Your promoter application is approved${
                approvedHint.brandName ? ` for ${approvedHint.brandName}` : ""
              }. Just set a password to get in.`
            : "Use the same email from your approved promoter application. It only takes a minute."}
        </p>

        <form
          method="post"
          action={PROMOTER_REGISTER_SUBMIT_PATH}
          className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6"
        >
          {showNotApproved ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
              We don&apos;t see an approved application for this email yet. Apply first, then come back after approval —
              or use the email from your approval message.
            </div>
          ) : null}
          {showRate ? (
            <div className="rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white">
              Too many signup attempts. Please try again later.
            </div>
          ) : null}
          {showUnavailable ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
              Registration could not complete. Check your connection and try again.
            </div>
          ) : null}
          {showConsent ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
              Please confirm the agreement below to create your account.
            </div>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Email</span>
            <input
              name="email"
              type="email"
              defaultValue={prefillEmail}
              className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white placeholder:text-white/40"
              placeholder="Same email as your application"
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
            label="Create account"
            pendingLabel="Creating…"
            className="mt-2 inline-flex h-12 min-w-[200px] items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-base font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          />
          <p className="text-xs text-white/55">
            Haven&apos;t applied yet?{" "}
            <Link className="underline hover:text-white" href="/promoter/apply">
              Submit a short application
            </Link>
            .
          </p>
        </form>
      </main>
    </div>
  );
}
