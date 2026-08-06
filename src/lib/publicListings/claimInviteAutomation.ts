/**
 * Staged claim-invite automation: daily/domain caps, pause state, eligibility.
 * Pause state persists in GrowthDiscoveryCursor (no extra migration).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { parseIntEnv } from "@/lib/marketing/emailConfig";
import { startOfUtcDay } from "@/lib/marketing/sendCaps";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { emailDomainMatchesSiteHost } from "@/lib/publicListings/claimInviteEligibility";
import { isFreeMailDomain } from "@/lib/publicListings/claimAutoApproval";
import { micstageClaimInvitesEnabled, effectiveListingClaimInvitesPerCron } from "@/lib/publicListings/automationKillSwitches";

const CONTROL_ADAPTER = "claim_invite_control";
const CONTROL_MARKET = "global";
const PAUSED_KEY = "paused";
const STATS_KEY = "rolling_stats";

/** Domains that must never receive automated claim invites. */
const BLOCKED_CLAIM_DOMAINS = new Set([
  "eventbrite.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "yelp.com",
  "tripadvisor.com",
  "timeout.com",
  "bandcamp.com",
  "ticketmaster.com",
  "dice.fm",
  "residentadvisor.net",
  "ra.co",
  "songkick.com",
  "bandsintown.com",
  "meetup.com",
  "craigslist.org",
  "wikipedia.org",
  "blogspot.com",
  "wordpress.com",
  "chicagotribune.com",
  "nytimes.com",
  "latimes.com",
  "washingtonpost.com",
  "npr.org",
  "spotify.com",
  "youtube.com",
]);

export type ClaimInvitePauseState = {
  paused: boolean;
  reason: string | null;
  pausedAt: string | null;
};

export type ClaimInviteRollingStats = {
  sends: number;
  hardBounces: number;
  complaints: number;
  unauthorizedAttempts: number;
  duplicatesBlocked: number;
  securityFailures: number;
  suppressionBypasses: number;
  claimPageFailures: number;
};

export type ClaimInviteSafetyKind =
  | "hard_bounce"
  | "complaint"
  | "unauthorized"
  | "duplicate"
  | "security_failure"
  | "suppression_bypass"
  | "claim_page_failure";

function envTruthy(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

function hostFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase().replace(/^www\./, "") || null;
}

export function listingClaimInvitesDailyMax(): number {
  return Math.min(50, Math.max(0, parseIntEnv("MICSTAGE_CLAIM_INVITES_DAILY_MAX", 10)));
}

export function listingClaimInvitesPerDomainDailyMax(): number {
  return Math.min(5, Math.max(1, parseIntEnv("MICSTAGE_CLAIM_INVITES_PER_DOMAIN_DAILY", 1)));
}

export function claimInvitesPausedByEnv(): boolean {
  return envTruthy(process.env.MICSTAGE_CLAIM_INVITES_PAUSED);
}

async function upsertControlValue(prisma: PrismaClient, cursorKey: string, value: string) {
  await prisma.growthDiscoveryCursor.upsert({
    where: {
      adapterId_marketSlug_cursorKey: {
        adapterId: CONTROL_ADAPTER,
        marketSlug: CONTROL_MARKET,
        cursorKey,
      },
    },
    create: {
      adapterId: CONTROL_ADAPTER,
      marketSlug: CONTROL_MARKET,
      cursorKey,
      value,
    },
    update: { value },
  });
}

async function readControlValue(prisma: PrismaClient, cursorKey: string): Promise<string | null> {
  const row = await prisma.growthDiscoveryCursor.findUnique({
    where: {
      adapterId_marketSlug_cursorKey: {
        adapterId: CONTROL_ADAPTER,
        marketSlug: CONTROL_MARKET,
        cursorKey,
      },
    },
    select: { value: true },
  });
  return row?.value ?? null;
}

export async function getClaimInvitePauseState(prisma: PrismaClient): Promise<ClaimInvitePauseState> {
  if (claimInvitesPausedByEnv()) {
    return { paused: true, reason: "MICSTAGE_CLAIM_INVITES_PAUSED", pausedAt: null };
  }
  const raw = await readControlValue(prisma, PAUSED_KEY);
  if (!raw) return { paused: false, reason: null, pausedAt: null };
  try {
    const parsed = JSON.parse(raw) as { paused?: boolean; reason?: string; pausedAt?: string };
    return {
      paused: Boolean(parsed.paused),
      reason: parsed.reason ?? null,
      pausedAt: parsed.pausedAt ?? null,
    };
  } catch {
    return { paused: raw === "1" || raw === "true", reason: raw, pausedAt: null };
  }
}

export async function setClaimInvitePaused(
  prisma: PrismaClient,
  input: { paused: boolean; reason: string },
): Promise<void> {
  await upsertControlValue(
    prisma,
    PAUSED_KEY,
    JSON.stringify({
      paused: input.paused,
      reason: input.reason,
      pausedAt: input.paused ? new Date().toISOString() : null,
    }),
  );
}

export async function getClaimInviteRollingStats(prisma: PrismaClient): Promise<ClaimInviteRollingStats> {
  const empty: ClaimInviteRollingStats = {
    sends: 0,
    hardBounces: 0,
    complaints: 0,
    unauthorizedAttempts: 0,
    duplicatesBlocked: 0,
    securityFailures: 0,
    suppressionBypasses: 0,
    claimPageFailures: 0,
  };
  const raw = await readControlValue(prisma, STATS_KEY);
  if (!raw) return empty;
  try {
    return {
      ...empty,
      ...(JSON.parse(raw) as Partial<ClaimInviteRollingStats>),
    };
  } catch {
    return empty;
  }
}

export async function recordClaimInviteSendStat(prisma: PrismaClient): Promise<void> {
  const stats = await getClaimInviteRollingStats(prisma);
  stats.sends += 1;
  await upsertControlValue(prisma, STATS_KEY, JSON.stringify(stats));
}

export async function recordClaimInviteSafetyEvent(
  prisma: PrismaClient,
  kind: ClaimInviteSafetyKind,
): Promise<ClaimInvitePauseState> {
  const stats = await getClaimInviteRollingStats(prisma);
  if (kind === "hard_bounce") stats.hardBounces += 1;
  if (kind === "complaint") stats.complaints += 1;
  if (kind === "unauthorized") stats.unauthorizedAttempts += 1;
  if (kind === "duplicate") stats.duplicatesBlocked += 1;
  if (kind === "security_failure") stats.securityFailures += 1;
  if (kind === "suppression_bypass") stats.suppressionBypasses += 1;
  if (kind === "claim_page_failure") stats.claimPageFailures += 1;
  await upsertControlValue(prisma, STATS_KEY, JSON.stringify(stats));

  // Immediate pause for any complaint / unauthorized / duplicate / security / suppression / claim-page failure.
  // Bounce thresholds: 2 hard bounces in first 10 sends, or >5% after ≥20 sends.
  let pauseReason: string | null = null;
  if (stats.complaints >= 1 || kind === "complaint") pauseReason = "complaint_received";
  else if (kind === "unauthorized") pauseReason = "unauthorized_recipient";
  else if (kind === "duplicate") pauseReason = "duplicate_invitation";
  else if (kind === "security_failure") pauseReason = "token_or_session_security_failure";
  else if (kind === "suppression_bypass") pauseReason = "suppression_bypass";
  else if (kind === "claim_page_failure") pauseReason = "claim_page_failure";
  else if (stats.sends <= 10 && stats.hardBounces >= 2) pauseReason = "hard_bounce_early_threshold";
  else if (stats.sends >= 20 && stats.hardBounces / stats.sends > 0.05) {
    pauseReason = "hard_bounce_rate_above_5pct";
  }

  if (pauseReason) {
    await setClaimInvitePaused(prisma, { paused: true, reason: pauseReason });
    return { paused: true, reason: pauseReason, pausedAt: new Date().toISOString() };
  }
  return getClaimInvitePauseState(prisma);
}

export async function countClaimInvitesSentTodayUtc(prisma: PrismaClient): Promise<number> {
  const since = startOfUtcDay();
  return prisma.publicOpenMicListing.count({
    where: { claimInviteEmailSentAt: { gte: since } },
  });
}

export async function claimInviteDailyBudgetSnapshot(prisma: PrismaClient): Promise<{
  max: number;
  sentTodayUtc: number;
  remaining: number;
}> {
  const max = listingClaimInvitesDailyMax();
  const sentTodayUtc = await countClaimInvitesSentTodayUtc(prisma);
  return { max, sentTodayUtc, remaining: Math.max(0, max - sentTodayUtc) };
}

export async function countClaimInvitesSentTodayForDomain(
  prisma: PrismaClient,
  domain: string,
): Promise<number> {
  const since = startOfUtcDay();
  const d = domain.toLowerCase().replace(/^www\./, "");
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      claimInviteEmailSentAt: { gte: since },
      claimInviteEmail: { contains: `@${d}`, mode: "insensitive" },
    },
    select: { claimInviteEmail: true },
  });
  return rows.filter((r) => {
    const e = (r.claimInviteEmail || "").toLowerCase();
    return e.endsWith(`@${d}`);
  }).length;
}

export function isBlockedClaimInviteDomain(domainOrEmail: string): boolean {
  const host = domainOrEmail.includes("@")
    ? emailDomain(domainOrEmail)
    : domainOrEmail.toLowerCase().replace(/^www\./, "");
  if (!host) return true;
  if (BLOCKED_CLAIM_DOMAINS.has(host)) return true;
  for (const blocked of BLOCKED_CLAIM_DOMAINS) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

/**
 * Staged automation eligibility: HIGH + official same-domain + not free-mail + not blocked domain.
 * MEDIUM contacts are excluded during this phase.
 */
export function isStagedClaimInviteContactEligible(input: {
  email: string;
  confidence: string | null | undefined;
  websiteUrl?: string | null;
  sourceUrl?: string | null;
}): boolean {
  const email = normalizeMarketingEmail(input.email);
  if (!email) return false;
  if (input.confidence !== "HIGH") return false;
  if (isFreeMailDomain(email)) return false;
  if (isBlockedClaimInviteDomain(email)) return false;
  const siteHost = hostFromUrl(input.websiteUrl) || hostFromUrl(input.sourceUrl);
  if (!siteHost || !emailDomainMatchesSiteHost(email, siteHost)) return false;
  return true;
}

export function listingPassesStagedClaimInviteSafety(listing: {
  verificationStatus: string;
  claimStatus: string;
  claimedVenueId: string | null;
  googlePlaceId: string | null;
  evidenceTerminalReason: string | null;
  internalNotes: string | null;
  name: string;
  about: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (listing.verificationStatus !== "VERIFIED") return { ok: false, reason: "not_verified" };
  if (listing.claimStatus !== "UNCLAIMED") return { ok: false, reason: "not_unclaimed" };
  if (listing.claimedVenueId) return { ok: false, reason: "already_has_venue" };
  if (!listing.googlePlaceId) return { ok: false, reason: "missing_google_place" };
  const terminal = `${listing.evidenceTerminalReason ?? ""} ${listing.internalNotes ?? ""}`;
  if (/PLACE_OR_REGION_CONFLICT|CANCELLED|CLOSED|NO_TRUSTED_EVIDENCE/i.test(terminal)) {
    return { ok: false, reason: "evidence_terminal_block" };
  }
  if (/cancel+ed|permanently closed/i.test(`${listing.name} ${listing.about ?? ""}`)) {
    return { ok: false, reason: "cancellation_signal" };
  }
  return { ok: true };
}

/** Whether the automated cron worker may send claim invites right now. */
export async function claimInviteAutomationMaySend(prisma: PrismaClient): Promise<{
  ok: boolean;
  reason?: string;
  dailyRemaining: number;
  perCron: number;
}> {
  if (!micstageClaimInvitesEnabled()) {
    return { ok: false, reason: "claim_invites_disabled", dailyRemaining: 0, perCron: 0 };
  }
  const pause = await getClaimInvitePauseState(prisma);
  if (pause.paused) {
    return { ok: false, reason: `paused:${pause.reason ?? "unknown"}`, dailyRemaining: 0, perCron: 0 };
  }
  const daily = await claimInviteDailyBudgetSnapshot(prisma);
  if (daily.remaining <= 0) {
    return { ok: false, reason: "daily_claim_invite_cap", dailyRemaining: 0, perCron: 0 };
  }
  const perCron = effectiveListingClaimInvitesPerCron();
  if (perCron <= 0) {
    return { ok: false, reason: "per_cron_zero", dailyRemaining: daily.remaining, perCron: 0 };
  }
  return {
    ok: true,
    dailyRemaining: daily.remaining,
    perCron: Math.min(perCron, daily.remaining),
  };
}

export function redactEmail(email: string): string {
  const n = email.toLowerCase().trim();
  const at = n.indexOf("@");
  if (at < 1) return "[redacted]";
  const local = n.slice(0, at);
  const domain = n.slice(at + 1);
  const domainBit =
    domain.length <= 4 ? "***" : `${domain.slice(0, 2)}***${domain.slice(domain.lastIndexOf("."))}`;
  return `${local.slice(0, 1)}***@${domainBit}`;
}
