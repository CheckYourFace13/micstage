import type { GrowthLeadContactQuality } from "@/generated/prisma/client";

/**
 * Derives contact quality for admin visibility and prioritization.
 */
export function deriveVenueContactQuality(input: {
  email: string | null | undefined;
  contactUrl: string | null | undefined;
  instagramUrl: string | null | undefined;
  facebookUrl: string | null | undefined;
}): GrowthLeadContactQuality {
  if (input.email?.trim()) return "EMAIL";
  const u = (input.contactUrl ?? "").toLowerCase();
  if (
    u &&
    /contact|book|booking|events?|calendar|inquir|rental|private|perform|host|open-mic|openmic/i.test(u)
  ) {
    return "CONTACT_PAGE";
  }
  if (input.instagramUrl?.trim() || input.facebookUrl?.trim()) return "SOCIAL_OR_CALENDAR";
  if (u) return "CONTACT_PAGE";
  return "WEBSITE_ONLY";
}
