import Link from "next/link";
import type { Metadata } from "next";
import { getPrismaOrNull } from "@/lib/prisma";
import { assertKnownLocationSlugOrNotFound } from "@/lib/locationSlugValidation";
import { minutesToTimeLabel } from "@/lib/time";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";

export const dynamic = "force-dynamic";

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export async function generateMetadata(props: { params: Promise<{ locationSlug: string }> }): Promise<Metadata> {
  const { locationSlug } = await props.params;
  const city = titleCaseSlug(locationSlug);
  return buildPublicMetadata({
    title: `${city} open mic performers`,
    description: `See who’s playing upcoming open mics in ${city}. Public, shareable performer list on MicStage.`,
    path: `/locations/${locationSlug}/performers`,
  });
}

export default async function LocationPerformersPage(props: { params: Promise<{ locationSlug: string }> }) {
  const { locationSlug } = await props.params;
  await assertKnownLocationSlugOrNotFound(locationSlug);
  const cityGuess = titleCaseSlug(locationSlug);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return <PublicDataUnavailable title="Performer list unavailable" />;
  }

  try {
    const allCityBookings = await prisma.booking.findMany({
      where: {
        cancelledAt: null,
        slot: {
          instance: {
            date: { gte: today },
            template: { venue: { city: { not: null } } },
          },
        },
      },
      orderBy: [{ slot: { instance: { date: "asc" } } }, { slot: { startMin: "asc" } }],
      take: 200,
      include: {
        slot: {
          include: {
            instance: {
              include: {
                template: {
                  include: { venue: true },
                },
              },
            },
          },
        },
      },
    });

    const bookings = allCityBookings.filter(
      (b) => (b.slot.instance.template.venue.city ?? "").toLowerCase() === cityGuess.toLowerCase(),
    );

    const shareUrl = absoluteUrl(`/locations/${locationSlug}/performers`);
    const shareText = `Who's playing upcoming open mics in ${cityGuess}?`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

    return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-white/60">Public performer list</div>
            <h1 className="om-heading mt-2 text-4xl tracking-wide">{cityGuess} performers</h1>
            <p className="mt-2 text-sm text-white/70">Upcoming open mic performers anyone can view or share.</p>
          </div>
          <Link className="text-sm text-white/70 hover:text-white" href="/locations">
            All locations
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Share this page</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <a className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm hover:bg-black/40" href={twitterUrl} target="_blank" rel="noreferrer">
              Share on X
            </a>
            <a className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm hover:bg-black/40" href={fbUrl} target="_blank" rel="noreferrer">
              Share on Facebook
            </a>
            <a className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm hover:bg-black/40" href={linkedInUrl} target="_blank" rel="noreferrer">
              Share on LinkedIn
            </a>
          </div>
          <div className="mt-2 text-xs text-white/50 break-all">{shareUrl}</div>
        </div>

        {bookings.length === 0 ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
            No upcoming performers found yet in this location.
          </div>
        ) : (
          <div className="mt-8 grid gap-3">
            {bookings.map((b) => {
              const inst = b.slot.instance;
              const t = inst.template;
              const v = t.venue;
              return (
                <article key={b.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold">{b.performerName}</h2>
                    <div className="text-xs text-white/60">
                      {inst.date.toISOString().slice(0, 10)} · {minutesToTimeLabel(b.slot.startMin)}-{minutesToTimeLabel(b.slot.endMin)}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-white/75">
                    {t.title} at{" "}
                    <Link className="underline" href={`/venues/${v.slug}`}>
                      {v.name}
                    </Link>
                    {v.region ? ` (${v.city}, ${v.region})` : v.city ? ` (${v.city})` : ""}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
    );
  } catch {
    return <PublicDataUnavailable title="Performer list unavailable" />;
  }
}

