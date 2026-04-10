import type { MarketingEmailCategory } from "@/generated/prisma/client";

export type MicStageEmailCategory = "transactional" | "outreach" | "marketing";

export function prismaCategoryFromMicStage(c: MicStageEmailCategory): MarketingEmailCategory {
  return c.toUpperCase() as MarketingEmailCategory;
}

export function micStageCategoryFromPrisma(c: MarketingEmailCategory): MicStageEmailCategory {
  return c.toLowerCase() as MicStageEmailCategory;
}

/** Transactional / product mail (password reset, reminders, etc.). */
export function transactionalFromAddress(): string {
  return (
    process.env.EMAIL_FROM_TRANSACTIONAL?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "MicStage <onboarding@resend.dev>"
  );
}

export function outreachFromAddress(): string {
  return (
    process.env.EMAIL_FROM_OUTREACH?.trim() ||
    process.env.EMAIL_FROM_MARKETING?.trim() ||
    transactionalFromAddress()
  );
}

export function marketingFromAddress(): string {
  return process.env.EMAIL_FROM_MARKETING?.trim() || outreachFromAddress();
}

export function fromAddressForMicStageCategory(category: MicStageEmailCategory): string {
  switch (category) {
    case "transactional":
      return transactionalFromAddress();
    case "outreach":
      return outreachFromAddress();
    case "marketing":
      return marketingFromAddress();
    default:
      return transactionalFromAddress();
  }
}

export function parseIntEnv(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function marketingDailyCap(category: MicStageEmailCategory): number {
  switch (category) {
    case "transactional":
      return parseIntEnv("MARKETING_CAP_DAILY_TRANSACTIONAL", 50_000);
    case "outreach":
      return parseIntEnv("MARKETING_CAP_DAILY_OUTREACH", 50);
    case "marketing":
      return parseIntEnv("MARKETING_CAP_DAILY_MARKETING", 40);
    default:
      return 0;
  }
}

export function marketingPerDomainDailyCap(): number {
  return parseIntEnv("MARKETING_CAP_PER_DOMAIN_DAILY", 5);
}

/** Hours between sends to same contact for outreach+marketing (same template family uses purposeKey). */
export function marketingContactCooldownHours(): number {
  return parseIntEnv("MARKETING_CONTACT_COOLDOWN_HOURS", 168);
}

/** Minimum minutes between any outreach/marketing sends to the same contact. */
export function marketingSequenceDelayMinutes(): number {
  return parseIntEnv("MARKETING_SEQUENCE_DELAY_MINUTES", 60);
}

export function marketingPhysicalAddressFooter(): string {
  return (
    process.env.MARKETING_PHYSICAL_ADDRESS?.trim() ||
    process.env.EMAIL_PHYSICAL_ADDRESS?.trim() ||
    "MicStage — add MARKETING_PHYSICAL_ADDRESS in env for production commercial mail."
  );
}

export function marketingUnsubscribeMailto(): string | undefined {
  const v = process.env.MARKETING_UNSUBSCRIBE_MAILTO?.trim();
  return v || undefined;
}

export function appBaseUrl(): string {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function venueWelcomeEmailEnabled(): boolean {
  return process.env.MARKETING_AUTO_VENUE_WELCOME_EMAIL === "true";
}

export function performerLifecycleEmailEnabled(): boolean {
  return process.env.MARKETING_AUTO_PERFORMER_LIFECYCLE === "true";
}

/** Growth lead follow-up schedules exist in DB; no worker sends until this is true. */
export function growthFollowUpAutomationEnabled(): boolean {
  return process.env.GROWTH_FOLLOW_UP_AUTOMATION_ENABLED === "true";
}
