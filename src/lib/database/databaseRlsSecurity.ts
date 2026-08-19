/**
 * Supabase PostgREST exposes the public schema to anon/authenticated roles.
 * MicStage uses Prisma (direct postgres) only — application tables must have RLS
 * enabled with no permissive policies so the Data API cannot read/write them.
 */
import type { PrismaClient } from "@/generated/prisma/client";

/** OperationalRuntimeSetting key — value must be "clear" before outreach auto-ramp above 25/day. */
export const DATABASE_RLS_SECURITY_GATE_KEY = "DATABASE_RLS_SECURITY_GATE";

/** Cap outreach daily max while the RLS security gate is not clear. */
export const DATABASE_RLS_SECURITY_OUTREACH_CAP = 25;

/**
 * Prisma @@map tables in public schema. Keep in sync with prisma/schema.prisma.
 * Used by test:database-security and migration comments.
 */
export const MICSTAGE_APPLICATION_PUBLIC_TABLES = [
  "VenueOwner",
  "PromoterApplication",
  "PromoterUser",
  "PromoterSeries",
  "PromoterVenueAccess",
  "PromoterNight",
  "PromoterApplicationReviewToken",
  "Venue",
  "VenueManager",
  "VenueManagerAccess",
  "MusicianUser",
  "VenuePerformerHistory",
  "MusicianPastVenue",
  "MusicianVenueInterest",
  "EventTemplate",
  "EventInstance",
  "Slot",
  "Booking",
  "MessageThread",
  "Message",
  "PasswordResetToken",
  "AuthRateLimitCounter",
  "MarketingEvent",
  "MarketingJob",
  "MarketingContact",
  "MarketingOutreachDraft",
  "MarketingEmailSend",
  "MarketingOutreachClick",
  "MarketingProviderWebhookEvent",
  "MarketingEmailSuppression",
  "GrowthLead",
  "GrowthDiscoveryCursor",
  "OperationalRuntimeSetting",
  "GrowthDiscoveryRun",
  "DiscoveryExecutionGuard",
  "DiscoveryInvocationLog",
  "GrowthLeadOutreachDraft",
  "GrowthLeadResponse",
  "GrowthLeadFollowUpSchedule",
  "GrowthLaunchMarket",
  "PublicOpenMicListing",
  "PublicOpenMicSchedule",
  "ListingClaimRequest",
  "ListingClaimInviteToken",
  "ListingClaimAuditEvent",
  "ListingOpenMicEvidence",
  "ListingCorrection",
  "OpenMicDemandRequest",
  "HostNightVenueDispute",
] as const;

export type MicStageApplicationPublicTable = (typeof MICSTAGE_APPLICATION_PUBLIC_TABLES)[number];

/** Tables Supabase Security Advisor flagged — subset of MICSTAGE_APPLICATION_PUBLIC_TABLES. */
export const SUPABASE_ADVISOR_FLAGGED_TABLES = [
  "PromoterApplicationReviewToken",
  "PromoterSeries",
  "PromoterUser",
  "PromoterVenueAccess",
  "PromoterNight",
  "PublicOpenMicSchedule",
  "ListingCorrection",
  "OpenMicDemandRequest",
  "ListingOpenMicEvidence",
  "DiscoveryExecutionGuard",
  "ListingClaimRequest",
  "DiscoveryInvocationLog",
  "OperationalRuntimeSetting",
  "ListingClaimInviteToken",
  "ListingClaimAuditEvent",
  "PublicOpenMicListing",
  "PromoterApplication",
  "MarketingOutreachClick",
  "HostNightVenueDispute",
] as const satisfies readonly MicStageApplicationPublicTable[];

export async function isDatabaseRlsSecurityGateClear(prisma: PrismaClient): Promise<boolean> {
  const row = await prisma.operationalRuntimeSetting.findUnique({
    where: { key: DATABASE_RLS_SECURITY_GATE_KEY },
    select: { value: true },
  });
  return row?.value === "clear";
}

export function clampOutreachDailyMaxForRlsGate(rawMax: number, gateClear: boolean): number {
  if (gateClear) return rawMax;
  return Math.min(rawMax, DATABASE_RLS_SECURITY_OUTREACH_CAP);
}
