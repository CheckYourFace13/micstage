import type { Metadata } from "next";
import Link from "next/link";
import { getPromoterSessionOrNull } from "@/lib/authz";
import { requirePrisma } from "@/lib/prisma";
import { buildPublicMetadata } from "@/lib/publicSeo";
import {
  extractPromoterVenueSearchNeedles,
  suggestOpenMicsForPromoterApplication,
} from "@/lib/onboarding/setupProgress";
import { FindOpenMicPanel } from "@/components/promoter/FindOpenMicPanel";
import { createPromoterSeriesAction } from "../actions";
import { FormSubmitButton } from "@/components/FormSubmitButton";

export const metadata: Metadata = buildPublicMetadata({
  title: "Welcome, promoter",
  description: "Your MicStage promoter account is ready. Set up your open mic in plain language.",
  path: "/promoter/welcome",
});

export const dynamic = "force-dynamic";

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
    },
  });

  const firstName =
    user?.application?.contactName?.trim().split(/\s+/)[0] ||
    session.email.split("@")[0] ||
    "there";
  const brand = user?.application?.brandName?.trim() || null;
  const cityRegion = user?.application?.cityRegion?.trim() || null;
  const venueHints = user?.application
    ? extractPromoterVenueSearchNeedles(user.application).filter(
        (n) => !brand || n.toLowerCase() !== brand.toLowerCase(),
      )
    : [];
  const primaryVenueHint = venueHints[0] || null;
  const suggested = user?.application
    ? await suggestOpenMicsForPromoterApplication(prisma, user.application)
    : [];
  const noInventoryMatch = suggested.length === 0 && Boolean(brand || primaryVenueHint);
  // When we cannot match inventory, Create is the usable path (not Find).
  const preferCreate = noInventoryMatch;

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

        {!step ? (
          <div className="mt-8 grid gap-3">
            {preferCreate ? (
              <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-50/90">
                {primaryVenueHint ? (
                  <>
                    Your application mentioned <span className="font-semibold text-white">{primaryVenueHint}</span>
                    {cityRegion ? <> in {cityRegion}</> : null}. We don&apos;t have that venue on MicStage yet — create{" "}
                    {brand ? <span className="font-semibold text-white">{brand}</span> : "your open mic"} now, then
                    connect the venue when it appears.
                  </>
                ) : (
                  <>
                    We couldn&apos;t find a matching listing yet. Create your open mic with a clear name — venue
                    connection can come next.
                  </>
                )}
              </div>
            ) : null}
            <p className="text-sm font-medium text-white/85">What would you like to do?</p>
            {preferCreate ? (
              <>
                <Link
                  href="/promoter/welcome?step=create"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-violet-400/40 bg-violet-500/20 px-5 text-base font-semibold text-violet-50 hover:bg-violet-500/30"
                >
                  Create {brand || "a new open mic"}
                </Link>
                <Link
                  href="/promoter/welcome?step=find"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-base font-semibold text-white hover:bg-white/10"
                >
                  Search anyway
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/promoter/welcome?step=find"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-violet-400/40 bg-violet-500/20 px-5 text-base font-semibold text-violet-50 hover:bg-violet-500/30"
                >
                  Find my open mic
                </Link>
                <Link
                  href="/promoter/welcome?step=create"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-base font-semibold text-white hover:bg-white/10"
                >
                  Create a new open mic
                </Link>
              </>
            )}
            <Link
              href="/promoter/welcome/skip"
              className="inline-flex h-12 items-center justify-center rounded-md px-5 text-base font-medium text-white/60 underline hover:text-white"
            >
              Do this later
            </Link>
          </div>
        ) : null}

        {step === "find" ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-white">Find my open mic</h2>
            <p className="mt-1 text-sm text-white/60">
              {preferCreate && primaryVenueHint
                ? `Try searching “${primaryVenueHint}” — if nothing matches, create your open mic instead.`
                : "Search by name. We'll handle the rest."}
            </p>
            <div className="mt-4">
              <FindOpenMicPanel
                suggested={suggested}
                initialQuery={primaryVenueHint || brand || undefined}
              />
            </div>
            {preferCreate ? (
              <p className="mt-4 text-sm text-white/65">
                Nothing here?{" "}
                <Link href="/promoter/welcome?step=create" className="underline hover:text-white">
                  Create {brand || "your open mic"}
                </Link>
              </p>
            ) : null}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/promoter/welcome/skip"
                className="inline-flex h-11 flex-1 items-center justify-center text-sm text-white/55 underline hover:text-white"
              >
                Do this later
              </Link>
            </div>
          </section>
        ) : null}

        {step === "create" ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-white">Name your open mic</h2>
            <p className="mt-1 text-sm text-white/60">
              Required now: open mic name
              {primaryVenueHint ? ` (venue: ${primaryVenueHint} can connect later)` : ""}. Everything else is
              optional afterward.
            </p>
            <form action={createPromoterSeriesAction} className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-white/75">Open mic name</span>
                <input
                  name="name"
                  required
                  defaultValue={brand || ""}
                  className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white"
                  placeholder="Friday night open mic"
                />
              </label>
              {primaryVenueHint ? (
                <p className="text-xs text-white/50">
                  Venue hint from your application: {primaryVenueHint}
                  {cityRegion ? ` · ${cityRegion}` : ""}. You&apos;ll connect it after save — no slug or IDs needed.
                </p>
              ) : null}
              <FormSubmitButton
                label="Save and continue"
                pendingLabel="Saving…"
                className="inline-flex h-12 items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 px-5 text-sm font-semibold text-violet-50 hover:bg-violet-500/25 disabled:opacity-60"
              />
            </form>
            <p className="mt-4 text-sm text-white/55">
              Or{" "}
              <Link href="/promoter/welcome?step=find" className="underline hover:text-white">
                find an existing open mic
              </Link>
              {" · "}
              <Link href="/promoter/welcome/skip" className="underline hover:text-white">
                do this later
              </Link>
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
