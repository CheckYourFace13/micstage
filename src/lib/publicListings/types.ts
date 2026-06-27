import type { PublicOpenMicListingPayload } from "@/lib/publicListings/queries";

/** How a row appears in merged public discovery. */
export type DiscoveryListingKind = "claimed" | "verified" | "unclaimed";

export type OpenMicFinderVenue = {
  slug: string;
  href: string;
  kind: DiscoveryListingKind;
  bookable: boolean;
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
  badgeLabel: string;
  name: string;
  city: string | null;
  region: string | null;
  formattedAddress: string;
  distanceMiles: number | null;
  distanceLabel: string;
};

export function discoveryBadgeLabel(kind: DiscoveryListingKind, bookable: boolean): string {
  if (bookable) return "Bookable on MicStage";
  if (kind === "verified") return "Verified listing";
  return "Unclaimed";
}

export function listingPublicHref(slug: string): string {
  return `/open-mics/${slug}`;
}

export function venuePublicHref(slug: string): string {
  return `/venues/${slug}`;
}
