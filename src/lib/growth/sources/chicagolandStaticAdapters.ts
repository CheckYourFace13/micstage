import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import {
  CHICAGOLAND_ARTIST_SOCIAL_SEEDS,
  CHICAGOLAND_EVENT_LISTING_VENUE_SEEDS,
  CHICAGOLAND_PROMOTER_SOCIAL_SEEDS,
  CHICAGOLAND_SLUG,
  CHICAGOLAND_VENUE_SOCIAL_SEEDS,
  CHICAGOLAND_VENUE_WEBSITE_SEEDS,
} from "@/lib/growth/data/chicagolandDiscoverySeeds";
import type { GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";

const REGION = "IL";

function isChicagoland(ctxSlug: string): boolean {
  return ctxSlug.trim().toLowerCase() === CHICAGOLAND_SLUG;
}

export function createChicagolandVenueWebsiteAdapter(): GrowthLeadSourceAdapter {
  return {
    id: "chicagoland_venue_website_contact",
    leadType: "VENUE",
    async discover(ctx) {
      if (!isChicagoland(ctx.discoveryMarketSlug)) return [];
      const out: GrowthLeadCandidate[] = [];
      for (const s of CHICAGOLAND_VENUE_WEBSITE_SEEDS) {
        out.push({
          leadType: "VENUE",
          name: s.name,
          websiteUrl: s.websiteUrl,
          contactUrl: s.contactUrl ?? null,
          city: s.city,
          suburb: s.suburb ?? null,
          region: REGION,
          discoveryMarketSlug: CHICAGOLAND_SLUG,
          source: s.source,
          sourceKind: "WEBSITE_CONTACT",
          fitScore: s.fitScore ?? null,
          discoveryConfidence: s.discoveryConfidence,
          importKey: s.importKey,
          internalNotes: "Curated Chicagoland venue web/contact seed — verify email before outreach.",
        });
      }
      return out;
    },
  };
}

export function createChicagolandVenueSocialAdapter(): GrowthLeadSourceAdapter {
  return {
    id: "chicagoland_venue_social_profile",
    leadType: "VENUE",
    async discover(ctx) {
      if (!isChicagoland(ctx.discoveryMarketSlug)) return [];
      const out: GrowthLeadCandidate[] = [];
      for (const s of CHICAGOLAND_VENUE_SOCIAL_SEEDS) {
        out.push({
          leadType: "VENUE",
          name: s.name,
          instagramUrl: s.instagramUrl,
          websiteUrl: s.websiteUrl ?? null,
          city: s.city,
          suburb: s.suburb ?? null,
          region: REGION,
          discoveryMarketSlug: CHICAGOLAND_SLUG,
          source: s.source,
          sourceKind: "SOCIAL_PROFILE",
          fitScore: s.fitScore ?? null,
          discoveryConfidence: s.discoveryConfidence,
          importKey: s.importKey,
          internalNotes: "Curated venue social URL — prefer verified contact before cold outreach.",
        });
      }
      return out;
    },
  };
}

export function createChicagolandEventListingVenueAdapter(): GrowthLeadSourceAdapter {
  return {
    id: "chicagoland_event_listing_venue",
    leadType: "VENUE",
    async discover(ctx) {
      if (!isChicagoland(ctx.discoveryMarketSlug)) return [];
      const out: GrowthLeadCandidate[] = [];
      for (const s of CHICAGOLAND_EVENT_LISTING_VENUE_SEEDS) {
        out.push({
          leadType: "VENUE",
          name: s.name,
          contactUrl: s.contactUrl,
          websiteUrl: s.websiteUrl ?? null,
          city: s.city,
          suburb: s.suburb ?? null,
          region: REGION,
          discoveryMarketSlug: CHICAGOLAND_SLUG,
          source: s.source,
          sourceKind: "EVENT_LISTING",
          fitScore: s.fitScore ?? null,
          discoveryConfidence: s.discoveryConfidence,
          importKey: s.importKey,
          internalNotes: "Listing / calendar seed — mine for recurring open mics and venue contacts.",
        });
      }
      return out;
    },
  };
}

export function createChicagolandArtistSocialAdapter(): GrowthLeadSourceAdapter {
  return {
    id: "chicagoland_artist_social_profile",
    leadType: "ARTIST",
    async discover(ctx) {
      if (!isChicagoland(ctx.discoveryMarketSlug)) return [];
      const out: GrowthLeadCandidate[] = [];
      for (const s of CHICAGOLAND_ARTIST_SOCIAL_SEEDS) {
        out.push({
          leadType: "ARTIST",
          name: s.name,
          instagramUrl: s.instagramUrl ?? null,
          youtubeUrl: s.youtubeUrl ?? null,
          websiteUrl: s.websiteUrl ?? null,
          city: s.city,
          suburb: s.suburb ?? null,
          region: REGION,
          discoveryMarketSlug: CHICAGOLAND_SLUG,
          source: s.source,
          sourceKind: s.instagramUrl || s.youtubeUrl ? "SOCIAL_PROFILE" : "WEBSITE_CONTACT",
          fitScore: s.fitScore ?? null,
          discoveryConfidence: s.discoveryConfidence,
          importKey: s.importKey,
          internalNotes: "Artist discovery seed — many are research hubs; replace with named artists as you confirm.",
        });
      }
      return out;
    },
  };
}

export function createChicagolandPromoterSocialAdapter(): GrowthLeadSourceAdapter {
  return {
    id: "chicagoland_promoter_social_profile",
    leadType: "PROMOTER_ACCOUNT",
    async discover(ctx) {
      if (!isChicagoland(ctx.discoveryMarketSlug)) return [];
      const out: GrowthLeadCandidate[] = [];
      for (const s of CHICAGOLAND_PROMOTER_SOCIAL_SEEDS) {
        out.push({
          leadType: "PROMOTER_ACCOUNT",
          name: s.name,
          instagramUrl: s.instagramUrl ?? null,
          websiteUrl: s.websiteUrl ?? null,
          contactUrl: s.contactUrl ?? null,
          city: s.city,
          region: REGION,
          discoveryMarketSlug: CHICAGOLAND_SLUG,
          source: s.source,
          sourceKind: s.instagramUrl ? "SOCIAL_PROFILE" : "WEBSITE_CONTACT",
          fitScore: s.fitScore ?? null,
          discoveryConfidence: s.discoveryConfidence,
          importKey: s.importKey,
          internalNotes: "Promoter / producer seed — partnership or talent-pipeline angle.",
        });
      }
      return out;
    },
  };
}

export function allChicagolandStaticAdapters(): GrowthLeadSourceAdapter[] {
  return [
    createChicagolandVenueWebsiteAdapter(),
    createChicagolandVenueSocialAdapter(),
    createChicagolandEventListingVenueAdapter(),
    createChicagolandArtistSocialAdapter(),
    createChicagolandPromoterSocialAdapter(),
  ];
}
