import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PROMOTER_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { getSession } from "@/lib/session";
import { BetaNote } from "@/components/BetaNote";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { RegistrationContentConsent } from "@/components/RegistrationContentConsent";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { PROMOTER_REGISTER_SUBMIT_PATH } from "./actions";

export const metadata: Metadata = buildPublicMetadata({
  title: "Promoter registration",
  description:
    "Create your MicStage promoter account after your application has been approved. Organize series, request venue access, and plan nights.",
  path: "/register/promoter",
});

export default async function PromoterRegisterPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const session = await getSession();
  if (session?.kind === "promoter") redirect(PROMOTER_DASHBOARD_HREF);

  const showRate = error === "rate";
  const showUnavailable = error === "unavailable";
  const showConsent = error === "consent";
  const showNotApproved = error === "notApproved";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <Link className="text-sm text-white/70 hover:text-white" href="/">
          &lt;- Back
        </Link>

        <h1 className="om-heading mt-6 text-4xl tracking-wide">Promoter registration</h1>
        <p className="mt-2 text-sm text-white/70">
          For organizers whose <span className="text-white/90">promoter application is approved</span>. Use the same email as
          your application. You will set a private password — this account is separate from artist and venue logins.
        </p>
        <BetaNote className="mt-3" />

        <form
          method="post"
          action={PROMOTER_REGISTER_SUBMIT_PATH}
          className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          {showNotApproved ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
              No approved promoter application matches this email yet. Apply first, then register after you receive approval — or
              use the email from your approved application.
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
              Please confirm the agreement below (Terms, Privacy, and content use) to create your account.
            </div>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Email</span>
            <input
              name="email"
              type="email"
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="Same email as your promoter application"
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
            label="Create promoter account"
            pendingLabel="Creating account..."
            className="mt-2 inline-flex h-11 min-w-[200px] items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          />
          <p className="text-xs text-white/55">
            Haven&apos;t applied yet?{" "}
            <Link className="underline hover:text-white" href="/promoter/apply">
              Submit a promoter application
            </Link>
            .
          </p>
        </form>
      </main>
    </div>
  );
}
