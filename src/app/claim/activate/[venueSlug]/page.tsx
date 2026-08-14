import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { absoluteUrl } from "@/lib/publicSeo";
import { SharePageButtons } from "@/components/onboarding/SharePageButtons";
import { ClaimActivationEditor } from "@/components/publicListings/ClaimActivationEditor";

export const dynamic = "force-dynamic";

export default async function ClaimActivatePage(props: {
  params: Promise<{ venueSlug: string }>;
}) {
  const { venueSlug } = await props.params;
  const prisma = getPrismaOrNull();
  if (!prisma) notFound();

  const session = await getSession();
  if (!session || session.kind !== "venue" || !session.venueOwnerId) {
    redirect(`/login/venue?next=${encodeURIComponent(`/claim/activate/${venueSlug}`)}`);
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

  const publicUrl = absoluteUrl(`/venues/${venue.slug}`);

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-xs uppercase tracking-wide text-white/45">Your open mic</p>
        <h1 className="om-heading mt-2 text-3xl">Your open mic is claimed.</h1>
        <p className="mt-2 text-sm text-white/70">
          <span className="text-white">{venue.name}</span> is on your MicStage account. Pick one next step — everything is
          optional.
        </p>

        <div className="mt-8 grid gap-3">
          <Link
            href="/venue#schedule"
            className="inline-flex h-12 items-center justify-center rounded-md border border-violet-400/40 bg-violet-500/20 px-5 text-base font-semibold text-violet-50 hover:bg-violet-500/30"
          >
            Confirm schedule
          </Link>
          <Link
            href="/venue#profile"
            className="inline-flex h-12 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-base font-semibold text-white hover:bg-white/10"
          >
            Improve listing
          </Link>
          <Link
            href="/venue#booking"
            className="inline-flex h-12 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-base font-semibold text-white hover:bg-white/10"
          >
            Turn on performer signups
          </Link>
          <Link
            href="/venue"
            className="inline-flex h-11 items-center justify-center px-5 text-sm font-medium text-white/60 underline hover:text-white"
          >
            Do this later
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="mb-3 text-sm font-medium text-white/85">Share your page</p>
          <SharePageButtons url={publicUrl} label="Public page" />
        </div>

        <details className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white/80">More setup options (optional)</summary>
          <div className="mt-4">
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
        </details>

        <p className="mt-6 text-center text-sm text-white/50">
          <Link href={`/venues/${venue.slug}`} className="underline text-[rgb(var(--om-neon))]">
            Preview public page
          </Link>
          {" · "}
          <Link href="/venue" className="underline text-white/70">
            Venue home
          </Link>
        </p>
      </main>
    </div>
  );
}
