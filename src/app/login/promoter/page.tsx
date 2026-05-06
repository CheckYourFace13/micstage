export const metadata = {
  title: "Promoter login | MicStage",
};

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { PROMOTER_DASHBOARD_HREF, safeAfterAuthPath } from "@/lib/safeRedirect";
import { BetaNote } from "@/components/BetaNote";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { PROMOTER_LOGIN_SUBMIT_PATH } from "./serverActions";

export default async function PromoterLoginPage(props: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await props.searchParams;
  const session = await getSession();
  if (session?.kind === "promoter") {
    redirect(safeAfterAuthPath(next, PROMOTER_DASHBOARD_HREF));
  }

  const showInvalid = error === "invalid";
  const showRate = error === "rate";
  const showUnavailable = error === "unavailable";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6 sm:py-16">
        <Link className="text-sm text-white/70 hover:text-white" href="/">
          &lt;- Back
        </Link>

        <h1 className="om-heading mt-6 text-4xl tracking-wide">Promoter login</h1>
        <p className="mt-2 text-sm text-white/70">
          Sign in with the <span className="text-white/90">email and password</span> you used when you created your promoter
          account after application approval.
        </p>
        <BetaNote className="mt-3" />

        <form
          method="post"
          action={PROMOTER_LOGIN_SUBMIT_PATH}
          className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          <input type="hidden" name="next" value={next ?? ""} />
          {showInvalid ? (
            <div className="rounded-xl border border-violet-400/35 bg-violet-500/10 px-4 py-3 text-sm text-white">
              Invalid email or password.
            </div>
          ) : null}
          {showRate ? (
            <div className="rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white">
              Too many attempts. Please wait and try again.
            </div>
          ) : null}
          {showUnavailable ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
              Sign-in is temporarily unavailable. Check your connection and try again. If this keeps happening, contact support.
            </div>
          ) : null}
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
            <span className="text-white/80">Password</span>
            <input
              name="password"
              type="password"
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="Your password"
              required
            />
          </label>

          <FormSubmitButton
            label="Log in"
            pendingLabel="Signing in..."
            className="mt-2 inline-flex h-11 min-w-[120px] items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          />

          <div className="text-xs text-white/60">
            Need access?{" "}
            <Link className="underline hover:text-white" href="/promoter/apply">
              Apply as a promoter
            </Link>
            . After approval,{" "}
            <Link className="underline hover:text-white" href="/register/promoter">
              create your account
            </Link>
            .
          </div>
        </form>
      </main>
    </div>
  );
}
