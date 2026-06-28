import type { PublicOpenMicListingPayload } from "@/lib/publicListings/queries";

/** How a row appears in merged public discovery. */
export type DiscoveryListingKind = "claimed" | "verified" | "unclaimed";

export type OpenMicFinderVenue = {
  slug: string;
  href: string;
  kind: DiscoveryListingKind;
  bookable: boolean;
  hasSchedule?: boolean;
  badgeLabel: string;
  name: string;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  discoverySlug: string | null;
};

export type NearbyDiscoveryRow = {
  slug: string;
  href: string;
  kind: DiscoveryListingKind;
  bookable: boolean;
  hasSchedule?: boolean;
  badgeLabel: string;
  name: string;
  city: string | null;
  region: string | null;
  formattedAddress: string;
  distanceMiles: number | null;
  distanceLabel: string;
};

export function discoveryBadgeLabel(
  kind: DiscoveryListingKind,
  bookable: boolean,
  opts?: { hasSchedule?: boolean },
): string {
  if (bookable) return "Bookable on MicStage";
  if (kind === "claimed") return "MicStage venue";
  if (kind === "verified") {
    return opts?.hasSchedule === false ? "Schedule details needed" : "Verified listing";
  }
  return "Unclaimed listing";
}

export function listingPublicHref(slug: string): string {
  return `/open-mics/${slug}`;
}

export function venuePublicHref(slug: string): string {
  return `/venues/${slug}`;
}
