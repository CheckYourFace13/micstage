import type { GrowthLeadType } from "@/generated/prisma/client";

/**
 * Discovery adapter registry for ops visibility.
 * - stub: `GROWTH_DISCOVERY_STUB_LEADS_JSON` only
 * - curated: shipped static Chicagoland seeds
 * - autonomous: direct crawlers + web search fallback (gated by env + runtime provider-state caps)
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

/** High-volume autonomous adapter ids (venue web search + crawl + listings API; no artist/promoter web search this phase). */
export const AUTONOMOUS_DISCOVERY_ADAPTER_IDS = [
  "autonomous_web_search_venue",
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
        "Nationwide SerpAPI/CSE (national-discovery-us cron lane) → open-mic query rotation + deep page fetch → ranked emails + state rollups",
    },
    {
      id: "autonomous_seed_url_crawl_venue",
      tier: "autonomous",
      description: "Operator seed URLs (GROWTH_DISCOVERY_CRAWL_SEED_URLS) → HTML contact mining",
    },
    {
      id: "autonomous_eventbrite_chicago",
      tier: "autonomous",
      description: "Eventbrite API (Chicago radius, q=open mic) → open-mic event rows → venue leads + signal tier",
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
