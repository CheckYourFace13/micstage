import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ClaimActivationEditor } from "@/components/publicListings/ClaimActivationEditor";

export const dynamic = "force-dynamic";

export default async function ClaimActivatePage(props: { params: Promise<{ venueSlug: string }> }) {
  const { venueSlug } = await props.params;
  const prisma = getPrismaOrNull();
  if (!prisma) notFound();

  const session = await getSession();
  if (!session || session.kind !== "venue" || !session.venueOwnerId) {
    redirect(`/login?next=${encodeURIComponent(`/claim/activate/${venueSlug}`)}`);
  }

  const venue = await prisma.venue.findUnique({
    where: { slug: venueSlug },
    include: {
      eventTemplates: { orderBy: { weekday: "asc" } },
      claimedFromListing: {
        select: {
          id: true,
          slug: true,
          name: true,
          signupMethod: true,
          cost: true,
          ageRestriction: true,
          equipmentNotes: true,
          accessibilityNotes: true,
          lastVerifiedAt: true,
          websiteUrl: true,
          facebookUrl: true,
          instagramUrl: true,
        },
      },
    },
  });
  if (!venue || venue.ownerId !== session.venueOwnerId) notFound();

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-xs uppercase tracking-wide text-white/45">Your open mic</p>
        <h1 className="om-heading mt-2 text-3xl">Your open mic is claimed</h1>
        <p className="mt-2 text-sm text-white/70">
          {venue.name} is on your MicStage account. Everything below is optional — skip and finish later anytime.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/venue"
            className="inline-flex h-11 items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 px-4 text-sm font-semibold text-violet-50 hover:bg-violet-500/25"
          >
            Go to my dashboard
          </Link>
          <Link href="/venue" className="inline-flex h-11 items-center justify-center px-4 text-sm text-white/60 underline">
            I&apos;ll do this later
          </Link>
        </div>
        <div className="mt-8">
          <ClaimActivationEditor
            venue={{
              id: venue.id,
              slug: venue.slug,
              name: venue.name,
              formattedAddress: venue.formattedAddress,
              websiteUrl: venue.websiteUrl,
              facebookUrl: venue.facebookUrl,
              instagramUrl: venue.instagramUrl,
              bookingOpensDaysAhead: venue.bookingOpensDaysAhead,
              bookingRestrictionMode: venue.bookingRestrictionMode,
            }}
            listing={venue.claimedFromListing}
            templates={venue.eventTemplates.map((t) => ({
              id: t.id,
              title: t.title,
              weekday: t.weekday,
              startTimeMin: t.startTimeMin,
              endTimeMin: t.endTimeMin,
              timeZone: t.timeZone,
              slotMinutes: t.slotMinutes,
              breakMinutes: t.breakMinutes,
              isPublic: t.isPublic,
              performanceFormat: t.performanceFormat,
              bookingRestrictionMode: t.bookingRestrictionMode,
            }))}
          />
        </div>
        <p className="mt-6 text-sm text-white/50">
          <Link href={`/venues/${venue.slug}`} className="underline text-[rgb(var(--om-neon))]">
            Preview public venue page
          </Link>
          {" · "}
          <Link href="/dashboard" className="underline text-white/70">
            Dashboard
          </Link>
        </p>
      </main>
    </div>
  );
}
