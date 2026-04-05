import type { GrowthLeadType } from "@/generated/prisma/client";
import { createEmptyAdapter } from "@/lib/growth/sources/placeholderAdapters";
import type { GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";
import { createStubJsonAdapter } from "@/lib/growth/sources/stubJsonAdapters";

const TYPES: GrowthLeadType[] = ["VENUE", "ARTIST", "PROMOTER_ACCOUNT"];

/** All registered discovery adapters (cron iterates by market + lead type). */
export function allGrowthDiscoveryAdapters(): GrowthLeadSourceAdapter[] {
  const stubs = TYPES.map((t) => createStubJsonAdapter(t));
  const placeholders: GrowthLeadSourceAdapter[] = [
    createEmptyAdapter("website_contact_venue", "VENUE"),
    createEmptyAdapter("website_contact_artist", "ARTIST"),
    createEmptyAdapter("website_contact_promoter", "PROMOTER_ACCOUNT"),
    createEmptyAdapter("social_profile_venue", "VENUE"),
    createEmptyAdapter("social_profile_artist", "ARTIST"),
    createEmptyAdapter("social_profile_promoter", "PROMOTER_ACCOUNT"),
    createEmptyAdapter("event_listing_venue", "VENUE"),
    createEmptyAdapter("event_listing_artist", "ARTIST"),
    createEmptyAdapter("event_listing_promoter", "PROMOTER_ACCOUNT"),
  ];
  return [...stubs, ...placeholders];
}
