/**
 * Production automation kill switches and staged claim-invite gates.
 * Stage 1 deploy: claim invites OFF unless explicitly enabled.
 */
import { parseIntEnv } from "@/lib/marketing/emailConfig";

function envTruthy(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

function envFalsyExplicit(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "false" || s === "0" || s === "no" || s === "off";
}

/** Master kill: national discovery adapters (web search / Eventbrite / seed crawl still respect autonomous flags). */
export function micstageDiscoveryKillSwitch(): boolean {
  return envTruthy(process.env.MICSTAGE_KILL_DISCOVERY);
}

/** Kill automatic Google verify + place-confirmed promote. */
export function micstagePromotionKillSwitch(): boolean {
  return envTruthy(process.env.MICSTAGE_KILL_PROMOTION);
}

/** Kill website email mining batch. */
export function micstageEmailMiningKillSwitch(): boolean {
  return envTruthy(process.env.MICSTAGE_KILL_EMAIL_MINING);
}

/**
 * Claim invitations require an explicit enable flag for staged rollout.
 * Default OFF so deploying e73c537 cannot blast invites until Stage 3 canary.
 */
export function micstageClaimInvitesEnabled(): boolean {
  if (envTruthy(process.env.MICSTAGE_KILL_CLAIM_INVITES)) return false;
  return envTruthy(process.env.MICSTAGE_CLAIM_INVITES_ENABLED);
}

/** Per-cron claim invite batch. Default 0 until canary; clamp 0–20. */
export function listingClaimInvitesPerCronStaged(): number {
  if (!micstageClaimInvitesEnabled()) return 0;
  const n = parseIntEnv("LISTING_CLAIM_INVITES_PER_CRON", 0);
  return Math.min(20, Math.max(0, n));
}

/** Canary ceiling — never send more than this in a single cron even if env is higher. */
export function listingClaimInviteCanaryMax(): number {
  return Math.min(20, Math.max(0, parseIntEnv("LISTING_CLAIM_INVITES_CANARY_MAX", 5)));
}

export function effectiveListingClaimInvitesPerCron(): number {
  const n = listingClaimInvitesPerCronStaged();
  if (n <= 0) return 0;
  // While canary mode is on (default), hard-cap at canary max.
  if (!envFalsyExplicit(process.env.MICSTAGE_CLAIM_INVITES_CANARY_MODE)) {
    return Math.min(n, listingClaimInviteCanaryMax());
  }
  return n;
}
