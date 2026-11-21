/**
 * Synthetic Venue.googlePlaceId for owners who enter address manually when Google
 * Autocomplete is unavailable. Never treat these as Google-verified identities.
 */
export const MANUAL_VENUE_PLACE_ID_PREFIX = "manual_";

export function isManualVenuePlaceId(placeId: string | null | undefined): boolean {
  return typeof placeId === "string" && placeId.startsWith(MANUAL_VENUE_PLACE_ID_PREFIX);
}

export function makeManualVenuePlaceId(unique: string): string {
  const id = unique.trim();
  if (!id) throw new Error("manual venue place id requires a unique suffix");
  return `${MANUAL_VENUE_PLACE_ID_PREFIX}${id}`;
}

export function composeManualVenueAddress(parts: {
  street: string;
  city: string;
  region?: string;
  postal?: string;
  country: string;
}): string {
  const street = parts.street.trim();
  const city = parts.city.trim();
  const region = parts.region?.trim() || "";
  const postal = parts.postal?.trim() || "";
  const country = parts.country.trim();
  const cityLine = [city, region, postal].filter(Boolean).join(", ");
  return [street, cityLine, country].filter(Boolean).join(", ");
}
