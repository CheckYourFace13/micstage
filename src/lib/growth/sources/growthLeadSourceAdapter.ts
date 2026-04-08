import type { GrowthLeadType } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";

export type GrowthLeadDiscoveryContext = {
  discoveryMarketSlug: string;
  leadType: GrowthLeadType;
  /** Present for autonomous adapters (cursors, pagination). Static/stub adapters may ignore. */
  prisma: PrismaClient;
  /**
   * Budget multiplier for autonomous web search (venue-only this phase; always 1 from runner).
   * Seed crawl / Eventbrite ignore.
   */
  autonomousWebSearchBudgetMultiplier?: number;
};

/**
 * Pluggable discovery path (manual, CSV, crawlers, social APIs, listing importers).
 * Implementations should return candidates only; ingestion applies dedupe and inserts.
 */
export type GrowthLeadSourceAdapter = {
  /** Stable id for logs (e.g. website_contact_stub). */
  id: string;
  /** Which lead type this adapter produces. */
  leadType: GrowthLeadType;
  discover(ctx: GrowthLeadDiscoveryContext): Promise<GrowthLeadCandidate[]>;
};
