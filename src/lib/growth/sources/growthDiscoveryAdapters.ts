import type { GrowthLeadType } from "@/generated/prisma/client";
import { createAutonomousEventbriteVenueAdapter } from "@/lib/growth/discovery/autonomousEventbriteAdapter";
import { createAutonomousSeedCrawlVenueAdapter } from "@/lib/growth/discovery/autonomousSeedCrawlAdapter";
import { createAutonomousVenueWebSearchAdapter } from "@/lib/growth/discovery/autonomousWebSearchAdapters";
import { allChicagolandStaticAdapters } from "@/lib/growth/sources/chicagolandStaticAdapters";
import type { GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";
import { createStubJsonAdapter } from "@/lib/growth/sources/stubJsonAdapters";

const TYPES: GrowthLeadType[] = ["VENUE", "ARTIST", "PROMOTER_ACCOUNT"];

function allAutonomousDiscoveryAdapters(): GrowthLeadSourceAdapter[] {
  return [
    createAutonomousEventbriteVenueAdapter(),
    createAutonomousSeedCrawlVenueAdapter(),
    createAutonomousVenueWebSearchAdapter(),
  ];
}

/** All registered discovery adapters (cron iterates by market + adapter). */
export function allGrowthDiscoveryAdapters(): GrowthLeadSourceAdapter[] {
  const stubs = TYPES.map((t) => createStubJsonAdapter(t));
  const autonomous = allAutonomousDiscoveryAdapters();
  const chicagolandCurated = allChicagolandStaticAdapters();
  /** Priority: internal seeds -> curated -> direct crawlers -> web search (Serp/CSE) last. */
  return [...stubs, ...chicagolandCurated, ...autonomous];
}
