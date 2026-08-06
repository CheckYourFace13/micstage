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
        <p className="text-xs uppercase tracking-wide text-white/45">Post-claim activation</p>
        <h1 className="om-heading mt-2 text-3xl">Confirm and publish</h1>
        <p className="mt-2 text-sm text-white/70">
          We prefilled {venue.name} from the verified listing. Confirm details, publish your schedule, and optionally enable booking.
        </p>
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
