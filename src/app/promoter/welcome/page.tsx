import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPromoterSessionOrNull } from "@/lib/authz";
import { requirePrisma } from "@/lib/prisma";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { suggestOpenMicsForPromoterApplication } from "@/lib/onboarding/setupProgress";
import { FindOpenMicPanel } from "@/components/promoter/FindOpenMicPanel";
import { createPromoterSeriesAction } from "../actions";
import { FormSubmitButton } from "@/components/FormSubmitButton";

export const metadata: Metadata = buildPublicMetadata({
  title: "Welcome, promoter",
  description: "Your MicStage promoter account is ready. Set up your open mic in plain language.",
  path: "/promoter/welcome",
});

export const dynamic = "force-dynamic";

const WELCOME_COOKIE = "om_promoter_welcome_seen";

export default async function PromoterWelcomePage(props: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await props.searchParams;
  const session = await getPromoterSessionOrNull();
  if (!session || session.kind !== "promoter") {
    throw new Error("Expected promoter auth guard middleware for /promoter/welcome.");
  }

  const prisma = requirePrisma();
  const user = await prisma.promoterUser.findUnique({
    where: { id: session.promoterId },
    select: {
      email: true,
      application: {
        select: { contactName: true, brandName: true, notes: true, cityRegion: true },
      },
      series: { select: { id: true }, take: 1 },
      venueAccess: { select: { id: true }, take: 1 },
    },
  });

  const firstName =
    user?.application?.contactName?.trim().split(/\s+/)[0] ||
    session.email.split("@")[0] ||
    "there";
  const brand = user?.application?.brandName?.trim() || null;
  const suggested = user?.application
    ? await suggestOpenMicsForPromoterApplication(prisma, user.application)
    : [];

  const cookieStore = await cookies();
  if (step === "later") {
    // Mark welcome seen via redirect query handled client-side isn't available on server set easily
    // without Route Handler — use redirect to dashboard with cookie set in response via separate path.
  }

  if (cookieStore.get(WELCOME_COOKIE)?.value === "1" && !step) {
    // Allow revisiting welcome intentionally via ?step=
  }

  const showFind = !step || step === "find" || step === "setup";
  const showSeries = step === "setup" || step === "series";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-widest text-white/55">Welcome</p>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">Welcome, {firstName}!</h1>
        <p className="mt-3 text-base text-white/75">
          Your MicStage promoter account is ready
          {brand ? (
            <>
              {" "}
              for <span className="text-white">{brand}</span>
            </>
          ) : null}
          .
        </p>
        <p className="mt-2 text-sm text-white/55">Signed in as {session.email}</p>

        {!step ? (
          <div className="mt-8 grid gap-3">
            <p className="text-sm font-medium text-white/85">What would you like to do?</p>
            <Link
              href="/promoter/welcome?step=find"
              className="inline-flex h-12 items-center justify-center rounded-md border border-violet-400/40 bg-violet-500/20 px-5 text-base font-semibold text-violet-50 hover:bg-violet-500/30"
            >
              Set up my open mic
            </Link>
            <Link
              href="/promoter/welcome?step=find"
              className="inline-flex h-12 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-base font-semibold text-white hover:bg-white/10"
            >
              Find my existing open mic
            </Link>
            <Link
              href="/promoter/welcome/skip"
              className="inline-flex h-12 items-center justify-center rounded-md px-5 text-base font-medium text-white/60 underline hover:text-white"
            >
              I&apos;ll do this later
            </Link>
          </div>
        ) : null}

        {showFind && step ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-white">Connect your open mic</h2>
            <p className="mt-1 text-sm text-white/60">
              Pick the place you host — we&apos;ll handle the rest. No technical codes required.
            </p>
            <div className="mt-4">
              <FindOpenMicPanel suggested={suggested} />
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/promoter/welcome?step=series"
                className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-white/15 bg-white/5 text-sm font-semibold hover:bg-white/10"
              >
                Next
              </Link>
              <Link
                href="/promoter/welcome/skip"
                className="inline-flex h-11 flex-1 items-center justify-center text-sm text-white/55 underline hover:text-white"
              >
                Skip for now
              </Link>
            </div>
          </section>
        ) : null}

        {showSeries && step === "series" ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-white">Name your open mic series</h2>
            <p className="mt-1 text-sm text-white/60">Optional — helps you organize nights. You can change this later.</p>
            <form action={createPromoterSeriesAction} className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-white/75">Series name</span>
                <input
                  name="name"
                  required
                  defaultValue={brand || ""}
                  className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white"
                  placeholder="Friday night open mic"
                />
              </label>
              <FormSubmitButton
                label="Save and continue"
                pendingLabel="Saving…"
                className="inline-flex h-12 items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 px-5 text-sm font-semibold text-violet-50 hover:bg-violet-500/25 disabled:opacity-60"
              />
            </form>
            <Link href="/promoter/welcome/skip" className="mt-4 inline-block text-sm text-white/55 underline">
              Skip for now
            </Link>
          </section>
        ) : null}
      </main>
    </div>
  );
}
