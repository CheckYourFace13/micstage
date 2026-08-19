import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VenueLineupBoard } from "@/components/venue/VenueLineupBoard";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";
import { VenueBookingFlash } from "@/components/VenueBookingFlash";
import { HostNightDisputeForm } from "@/components/host/HostNightDisputeForm";
import { getSession } from "@/lib/session";
import { venueIdsForVenueSession } from "@/lib/authz";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { loadHostNightLineupContext } from "@/lib/host/hostNightLineupData";
import { provisionHostNightLineup } from "@/lib/host/hostNightProvisioning";
import { storageYmdUtc } from "@/lib/venuePublicLineup";
import { getPrismaOrNull } from "@/lib/prisma";
import type { PublicVenueForLineup } from "@/lib/venuePublicLineupData";
import { lineupNavLabelFromYmd } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ nightId: string }> }): Promise<Metadata> {
  const { nightId } = await props.params;
  const ctx = await loadHostNightLineupContext(nightId);
  if (!ctx) return { title: "Open mic lineup" };
  const title = ctx.night.title?.trim() || ctx.night.series.name;
  return buildPublicMetadata({
    title: `${title} — ${ctx.night.venue.name} | MicStage`,
    description: `Performer signup and lineup for ${title} hosted by ${ctx.hostName} at ${ctx.night.venue.name}.`,
    path: `/nights/${nightId}/lineup`,
  });
}

export default async function HostNightLineupPage(props: {
  params: Promise<{ nightId: string }>;
  searchParams: Promise<{ bookError?: string; reserve?: string; booked?: string; cancelled?: string; embed?: string }>;
}) {
  const { nightId } = await props.params;
  const { bookError, reserve, booked, cancelled, embed } = await props.searchParams;
  const embedMode = embed === "1";

  let ctx = await loadHostNightLineupContext(nightId);
  if (!ctx) {
    const prisma = getPrismaOrNull();
    if (prisma) {
      const exists = await prisma.promoterNight.findUnique({ where: { id: nightId }, select: { id: true } });
      if (exists) {
        await provisionHostNightLineup(prisma, nightId);
        ctx = await loadHostNightLineupContext(nightId);
      }
    }
  }
  if (!ctx || !ctx.template || !ctx.instance) notFound();

  const session = await getSession();
  const now = new Date();
  const isMusician = session?.kind === "musician";
  const venueStaffVenueIds = session?.kind === "venue" ? await venueIdsForVenueSession(session) : [];
  const ymd = storageYmdUtc(ctx.night.date);
  const returnPath = embedMode
    ? `/nights/${nightId}/lineup?embed=1${reserve ? `&reserve=${encodeURIComponent(reserve)}` : ""}`
    : reserve
      ? `/nights/${nightId}/lineup?reserve=${encodeURIComponent(reserve)}`
      : `/nights/${nightId}/lineup`;

  const venueForBoard = {
    ...ctx.night.venue,
    eventTemplates: [{ ...ctx.template, instances: [ctx.instance] }],
  } as PublicVenueForLineup;

  const lineups = [{ template: ctx.template, instance: ctx.instance }];
  const seriesTitle = ctx.night.title?.trim() || ctx.night.series.name;

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className={embedMode ? "mx-auto w-full max-w-3xl px-4 py-5" : "mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 sm:py-12"}>
        {!embedMode ? (
          <header className="mb-6">
            <p className="text-xs font-medium uppercase tracking-widest text-white/50">Open mic lineup</p>
            <h1 className="om-heading mt-2 text-2xl tracking-wide sm:text-3xl">{seriesTitle}</h1>
            <p className="mt-2 text-sm text-white/70">
              Hosted by{" "}
              {ctx.night.series.promoter.hostSlug ? (
                <Link href={`/hosts/${ctx.night.series.promoter.hostSlug}`} className="underline hover:text-white">
                  {ctx.hostName}
                </Link>
              ) : (
                ctx.hostName
              )}{" "}
              · at{" "}
              <Link href={`/venues/${ctx.night.venue.slug}`} className="underline hover:text-white">
                {ctx.night.venue.name}
              </Link>
              {ctx.night.venue.city ? ` · ${ctx.night.venue.city}` : ""}
            </p>
            <p className="mt-1 text-sm text-white/55">{lineupNavLabelFromYmd(ymd)}</p>
          </header>
        ) : null}

        <VenueBookingFlash initialBooked={booked === "1"} initialCancelled={cancelled === "1"} />

        {bookError ? (
          <div className="mb-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            {bookError}
          </div>
        ) : null}

        <VenueLineupBoard
          venue={venueForBoard}
          lineups={lineups}
          ymd={ymd}
          now={now}
          session={session}
          venueStaffVenueIds={venueStaffVenueIds}
          isMusician={isMusician}
          returnPath={returnPath}
          reserve={reserve}
          embed={embedMode}
          showShareStrip={!embedMode}
          shareCanonicalPath={`/nights/${nightId}/lineup`}
        />

        {!embedMode ? (
          <HostNightDisputeForm nightId={nightId} venueName={ctx.night.venue.name} />
        ) : null}
      </main>
    </div>
  );
}
