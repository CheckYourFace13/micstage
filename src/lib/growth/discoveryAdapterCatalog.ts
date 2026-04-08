import type { GrowthLeadType } from "@/generated/prisma/client";

/**
 * Discovery adapter registry for ops visibility.
 * - stub: `GROWTH_DISCOVERY_STUB_LEADS_JSON` only
 * - curated: shipped static Chicagoland seeds
 * - autonomous: web search, seed crawl, Eventbrite (gated by env + `GROWTH_DISCOVERY_AUTONOMOUS_ENABLED`)
 */
export type GrowthDiscoveryAdapterTier = "stub" | "curated" | "autonomous";

export type GrowthDiscoveryAdapterInfo = {
  id: string;
  tier: GrowthDiscoveryAdapterTier;
  description: string;
};

export const CHICAGOLAND_STATIC_REAL_ADAPTER_IDS = [
  "chicagoland_venue_website_contact",
  "chicagoland_venue_social_profile",
  "chicagoland_event_listing_venue",
  "chicagoland_artist_social_profile",
  "chicagoland_promoter_social_profile",
] as const;

/** High-volume autonomous adapter ids (search + crawl + listings API). */
export const AUTONOMOUS_DISCOVERY_ADAPTER_IDS = [
  "autonomous_web_search_venue",
  "autonomous_web_search_artist",
  "autonomous_web_search_promoter",
  "autonomous_seed_url_crawl_venue",
  "autonomous_eventbrite_chicago",
] as const;

export function growthStubAdapterIdForLeadType(leadType: GrowthLeadType): string {
  return `stub_json_${leadType}`;
}

export function isStubDiscoveryAdapterId(id: string): boolean {
  return id.startsWith("stub_json_");
}

export function isCuratedStaticAdapterId(id: string): boolean {
  return (CHICAGOLAND_STATIC_REAL_ADAPTER_IDS as readonly string[]).includes(id);
}

export function isAutonomousDiscoveryAdapterId(id: string): boolean {
  return (AUTONOMOUS_DISCOVERY_ADAPTER_IDS as readonly string[]).includes(id);
}

export function listGrowthDiscoveryAdapterRegistry(): GrowthDiscoveryAdapterInfo[] {
  const stubs: GrowthLeadType[] = ["VENUE", "ARTIST", "PROMOTER_ACCOUNT"];
  const out: GrowthDiscoveryAdapterInfo[] = stubs.map((t) => ({
    id: growthStubAdapterIdForLeadType(t),
    tier: "stub",
    description: `Env JSON stub (${t} only) — set GROWTH_DISCOVERY_STUB_LEADS_JSON`,
  }));

  out.push(
    {
      id: "autonomous_web_search_venue",
      tier: "autonomous",
      description:
        "Google Programmable Search or SerpAPI → venue-oriented queries → fetch pages → extract emails/socials (Chicagoland)",
    },
    {
      id: "autonomous_web_search_artist",
      tier: "autonomous",
      description: "Same search stack → artist/booking-oriented queries",
    },
    {
      id: "autonomous_web_search_promoter",
      tier: "autonomous",
      description: "Same search stack → promoter / talent-buyer queries",
    },
    {
      id: "autonomous_seed_url_crawl_venue",
      tier: "autonomous",
      description: "Operator seed URLs (GROWTH_DISCOVERY_CRAWL_SEED_URLS) → HTML contact mining",
    },
    {
      id: "autonomous_eventbrite_chicago",
      tier: "autonomous",
      description: "Eventbrite API event search (Chicago radius) → venue-style listing rows",
    },
    {
      id: "chicagoland_venue_website_contact",
      tier: "curated",
      description: "Chicagoland venue websites / contact pages (curated static seeds)",
    },
    {
      id: "chicagoland_venue_social_profile",
      tier: "curated",
      description: "Chicagoland venue Instagram/social (curated static seeds)",
    },
    {
      id: "chicagoland_event_listing_venue",
      tier: "curated",
      description: "Chicagoland open mic / live event listing pages (curated static seeds)",
    },
    {
      id: "chicagoland_artist_social_profile",
      tier: "curated",
      description: "Chicagoland artist discovery via public social URLs (curated static seeds)",
    },
    {
      id: "chicagoland_promoter_social_profile",
      tier: "curated",
      description: "Chicagoland promoters / show producers (curated static seeds)",
    },
  );
  return out;
}
