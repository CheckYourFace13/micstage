import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { VenueSetupForm } from "@/components/register/VenueSetupForm";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Connect your venue",
  description: "Find and connect your venue on MicStage after creating your free account.",
  path: "/venue/setup",
  index: false,
  follow: false,
});

const GROWTH_LEAD_ID_RE = /^c[a-z0-9]{24}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export default async function VenueSetupPage(props: {
  searchParams: Promise<{
    error?: string;
    growthLead?: string;
    claimListing?: string;
    joined?: string;
  }>;
}) {
  const { error, growthLead, claimListing } = await props.searchParams;
  const session = await getSession();
  if (!session || session.kind !== "venue" || !session.venueOwnerId) {
    const qs = new URLSearchParams();
    if (typeof claimListing === "string" && SLUG_RE.test(claimListing.trim())) {
      qs.set("claimListing", claimListing.trim());
    }
    if (typeof growthLead === "string" && GROWTH_LEAD_ID_RE.test(growthLead.trim())) {
      qs.set("growthLead", growthLead.trim());
    }
    const q = qs.toString();
    redirect(q ? `/register/venue?${q}` : "/register/venue");
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    redirect("/venue?venueError=unavailable");
  }

  const existingVenue = await prisma.venue.findFirst({
    where: { ownerId: session.venueOwnerId },
    select: { id: true },
  });
  if (existingVenue) redirect("/venue");

  const claimSlug =
    typeof claimListing === "string" && SLUG_RE.test(claimListing.trim()) ? claimListing.trim() : "";
  const growthLeadId =
    typeof growthLead === "string" && GROWTH_LEAD_ID_RE.test(growthLead.trim()) ? growthLead.trim() : "";

  let claimSeed = null as null | {
    slug: string;
    name: string;
    googlePlaceId: string | null;
    formattedAddress: string;
    city: string | null;
    region: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
  };

  if (claimSlug) {
    const listing = await prisma.publicOpenMicListing.findUnique({
      where: { slug: claimSlug },
      select: {
        slug: true,
        name: true,
        googlePlaceId: true,
        formattedAddress: true,
        city: true,
        region: true,
        country: true,
        lat: true,
        lng: true,
        claimedVenueId: true,
        claimStatus: true,
      },
    });
    if (listing && !listing.claimedVenueId && listing.claimStatus !== "CLAIMED") {
      claimSeed = {
        slug: listing.slug,
        name: listing.name,
        googlePlaceId: listing.googlePlaceId,
        formattedAddress: listing.formattedAddress,
        city: listing.city,
        region: listing.region,
        country: listing.country,
        lat: listing.lat,
        lng: listing.lng,
      };
    }
  }

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <Link className="text-sm text-white/70 hover:text-white" href="/venue">
          Skip for now
        </Link>
        <h1 className="om-heading mt-4 text-3xl tracking-wide sm:text-4xl">Find your venue</h1>
        <p className="mt-2 text-sm text-white/70">
          Your account is ready. Connect the place you manage so performers can find you.
        </p>
        {claimSeed ? (
          <p className="mt-2 text-sm text-emerald-100/90">
            Connecting <span className="font-semibold text-white">{claimSeed.name}</span>
          </p>
        ) : null}

        <VenueSetupForm
          submitPath="/venue/setup/setup-submit"
          claimListingSlug={claimSlug || undefined}
          claimListing={claimSeed}
          growthLeadId={growthLeadId || undefined}
          error={typeof error === "string" ? error : null}
        />
      </main>
    </div>
  );
}
