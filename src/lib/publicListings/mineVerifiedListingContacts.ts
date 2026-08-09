import type { PrismaClient } from "@/generated/prisma/client";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import { extractFromHtml, rankVenueInternalUrls } from "@/lib/growth/discovery/extractFromHtml";
import { pickPrimaryVenueOutreachEmail } from "@/lib/growth/discovery/venueEmailExtraction";
import { persistGrowthLeadEmailContacts } from "@/lib/growth/growthLeadContactAutomation";
import { parseGrowthLeadEmailInput } from "@/lib/growth/leadEmailValidation";
import { readDiscoveryCursor, writeDiscoveryCursor } from "@/lib/growth/discovery/discoveryCursor";
import { isFreeMailDomain } from "@/lib/publicListings/claimAutoApproval";
import { emailDomainMatchesSiteHost } from "@/lib/publicListings/claimInviteEligibility";
import {
  isBlockedClaimInviteDomain,
  isStagedClaimInviteContactEligible,
} from "@/lib/publicListings/claimInviteAutomation";
import { micstageEmailMiningKillSwitch } from "@/lib/publicListings/automationKillSwitches";
import { getGrowthPipelineRuntimeCache } from "@/lib/growth/growthRuntimeSettings";

export type MineVerifiedContactsResult = {
  scanned: number;
  mined: number;
  highOfficial: number;
  failed: number;
  byFailureReason: Record<string, number>;
};

const MINE_ADAPTER = "verified_contact_mine";
const MINE_MARKET = "_global";
const MINE_CURSOR_KEY = "listing_updated_at";
const DOMAIN_COOLDOWN_HOURS = 72;
const MAX_ATTEMPTS = 4;

const CONTACT_PATH_CANDIDATES = [
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/team",
  "/staff",
  "/events",
  "/calendar",
  "/music",
  "/entertainment",
  "/booking",
  "/bookings",
  "/private-events",
  "/venue",
];

/** Official same-domain role mailboxes — HIGH without requiring a personal name. */
const ROLE_LOCAL =
  /^(info|hello|contact|events?|bookings?|music|entertainment|manager|management|office|venue|host)$/i;

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function appendNote(existing: string | null | undefined, line: string): string {
  const stamped = `[${new Date().toISOString().slice(0, 10)}] contact-mine: ${line}`;
  const base = existing?.trim();
  return base ? `${base}\n${stamped}` : stamped;
}

function parseMineMeta(notes: string | null | undefined): {
  attempts: number;
  nextAt: Date | null;
  lastReason: string | null;
} {
  const text = notes ?? "";
  const attempts = Number((/contact-mine-attempts=(\d+)/i.exec(text) || [])[1] || 0);
  const nextRaw = (/contact-mine-next=([^\s\]]+)/i.exec(text) || [])[1] || null;
  const lastReason = (/contact-mine-reason=([A-Z0-9_]+)/i.exec(text) || [])[1] || null;
  const nextAt = nextRaw ? new Date(nextRaw) : null;
  return {
    attempts: Number.isFinite(attempts) ? attempts : 0,
    nextAt: nextAt && !Number.isNaN(nextAt.getTime()) ? nextAt : null,
    lastReason,
  };
}

function withMineMeta(
  notes: string | null | undefined,
  attempts: number,
  nextAt: Date,
  reason: string,
): string {
  const cleaned = (notes ?? "")
    .split("\n")
    .filter((l) => !/contact-mine-(attempts|next|reason)=/i.test(l))
    .join("\n")
    .trim();
  const meta = `contact-mine-attempts=${attempts} contact-mine-next=${nextAt.toISOString()} contact-mine-reason=${reason}`;
  return appendNote(cleaned, meta);
}

function absoluteSameHost(base: string, path: string): string | null {
  try {
    const u = new URL(path, base);
    const baseHost = new URL(base).hostname.replace(/^www\./i, "").toLowerCase();
    const h = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (h !== baseHost && !h.endsWith(`.${baseHost}`) && !baseHost.endsWith(`.${h}`)) return null;
    return u.toString().split("#")[0]!;
  } catch {
    return null;
  }
}

function minePriority(row: {
  websiteUrl: string | null;
  sourceUrl: string | null;
  googlePlaceId: string | null;
  growthLead: {
    websiteUrl: string | null;
    contactEmailNormalized: string | null;
    contactEmailConfidence: string | null;
    openMicSignalTier: string | null;
  } | null;
  evidenceCount: number;
}): number {
  let s = 0;
  const site = (row.websiteUrl || row.growthLead?.websiteUrl || "").trim();
  if (site) s += 100;
  if (row.googlePlaceId) s += 10;
  const email = row.growthLead?.contactEmailNormalized;
  const conf = row.growthLead?.contactEmailConfidence;
  if (email && conf === "MEDIUM") {
    try {
      const host = new URL(site || "https://invalid.invalid").hostname.replace(/^www\./i, "").toLowerCase();
      if (emailDomainMatchesSiteHost(email, host)) s += 50;
    } catch {
      /* ignore */
    }
  }
  if (row.growthLead?.openMicSignalTier === "EXPLICIT_OPEN_MIC") s += 20;
  if (row.evidenceCount > 0) s += Math.min(25, row.evidenceCount * 5);
  return s;
}

/**
 * Dedicated contact-mining queue for VERIFIED unclaimed listings lacking a HIGH
 * same-domain official mailbox. Persists attempt metadata + domain cooldown.
 */
export async function mineVerifiedListingOfficialEmails(
  prisma: PrismaClient,
  opts?: { limit?: number },
): Promise<MineVerifiedContactsResult> {
  if (micstageEmailMiningKillSwitch()) {
    return { scanned: 0, mined: 0, highOfficial: 0, failed: 0, byFailureReason: { killed: 1 } };
  }

  const cached = getGrowthPipelineRuntimeCache();
  const limit =
    opts?.limit ??
    cached?.verifiedContactMinePerTick.effective ??
    20;
  if (limit <= 0) return { scanned: 0, mined: 0, highOfficial: 0, failed: 0, byFailureReason: {} };

  const cursorRaw = await readDiscoveryCursor(prisma, MINE_ADAPTER, MINE_MARKET, MINE_CURSOR_KEY);
  const after = cursorRaw ? new Date(cursorRaw) : new Date(0);
  const now = new Date();

  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      verificationStatus: "VERIFIED",
      claimStatus: "UNCLAIMED",
      claimedVenueId: null,
      claimInviteEmailSentAt: null,
      googlePlaceId: { not: null },
      updatedAt: { gt: after },
    },
    orderBy: [{ updatedAt: "asc" }],
    take: Math.min(400, limit * 12),
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      sourceUrl: true,
      googlePlaceId: true,
      internalNotes: true,
      updatedAt: true,
      growthLead: {
        select: {
          id: true,
          name: true,
          discoveryMarketSlug: true,
          source: true,
          websiteUrl: true,
          discoveryConfidence: true,
          contactEmailNormalized: true,
          contactEmailConfidence: true,
          openMicSignalTier: true,
        },
      },
      _count: { select: { openMicEvidenceRows: true } },
    },
  });

  if (rows.length === 0) {
    await writeDiscoveryCursor(prisma, MINE_ADAPTER, MINE_MARKET, MINE_CURSOR_KEY, new Date(0).toISOString());
  }

  type Row = (typeof rows)[number];
  const candidates: Array<Row & { priority: number }> = [];
  let scanThroughAt: Date | null = null;

  for (const row of rows) {
    scanThroughAt = row.updatedAt;
    const email = row.growthLead?.contactEmailNormalized;
    const conf = row.growthLead?.contactEmailConfidence;
    const alreadyHigh =
      email &&
      conf &&
      isStagedClaimInviteContactEligible({
        email,
        confidence: conf,
        websiteUrl: row.websiteUrl,
        sourceUrl: row.sourceUrl,
      });
    if (alreadyHigh) continue;
    const meta = parseMineMeta(row.internalNotes);
    if (meta.nextAt && meta.nextAt > now) continue;
    if (meta.attempts >= MAX_ATTEMPTS) continue;
    candidates.push({
      ...row,
      priority: minePriority({
        websiteUrl: row.websiteUrl,
        sourceUrl: row.sourceUrl,
        googlePlaceId: row.googlePlaceId,
        growthLead: row.growthLead,
        evidenceCount: row._count.openMicEvidenceRows,
      }),
    });
  }

  candidates.sort((a, b) => b.priority - a.priority || a.updatedAt.getTime() - b.updatedAt.getTime());
  const needMine = candidates.slice(0, limit);

  let mined = 0;
  let highOfficial = 0;
  let failed = 0;
  const byFailureReason: Record<string, number> = {};

  for (const row of needMine) {
    const meta = parseMineMeta(row.internalNotes);
    const attempts = meta.attempts + 1;
    const nextAt = new Date(Date.now() + DOMAIN_COOLDOWN_HOURS * 3600 * 1000);

    const site = (row.websiteUrl || row.growthLead?.websiteUrl || "").trim();

    // Fast path: upgrade existing same-domain role / mailto-quality MEDIUM to HIGH without re-crawl.
    if (row.growthLead?.contactEmailNormalized && row.growthLead.contactEmailConfidence === "MEDIUM" && site) {
      let host: string | null = null;
      try {
        host = new URL(site).hostname.replace(/^www\./i, "").toLowerCase();
      } catch {
        host = null;
      }
      const existing = row.growthLead.contactEmailNormalized;
      const local = existing.split("@")[0] ?? "";
      if (
        host &&
        emailDomainMatchesSiteHost(existing, host) &&
        !isFreeMailDomain(existing) &&
        !isBlockedClaimInviteDomain(existing) &&
        ROLE_LOCAL.test(local)
      ) {
        await prisma.growthLead.update({
          where: { id: row.growthLead.id },
          data: {
            contactEmailConfidence: "HIGH",
            contactEmailRejectionReason: null,
          },
        });
        const eligible = isStagedClaimInviteContactEligible({
          email: existing,
          confidence: "HIGH",
          websiteUrl: site,
          sourceUrl: row.sourceUrl,
        });
        await prisma.publicOpenMicListing.update({
          where: { id: row.id },
          data: {
            claimInviteEmail: eligible ? existing : undefined,
            internalNotes: withMineMeta(
              row.internalNotes,
              attempts,
              nextAt,
              eligible ? "high_official_upgraded_role" : "upgraded_role_non_eligible",
            ),
          },
        });
        if (eligible) highOfficial += 1;
        mined += 1;
        continue;
      }
    }

    if (!site) {
      bump(byFailureReason, "no_website");
      failed += 1;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: { internalNotes: withMineMeta(row.internalNotes, attempts, nextAt, "no_website") },
      });
      continue;
    }
    if (!row.growthLead) {
      bump(byFailureReason, "no_growth_lead");
      failed += 1;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: { internalNotes: withMineMeta(row.internalNotes, attempts, nextAt, "no_growth_lead") },
      });
      continue;
    }

    let siteHost: string | null = null;
    try {
      siteHost = new URL(site).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      bump(byFailureReason, "invalid_website_url");
      failed += 1;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: { internalNotes: withMineMeta(row.internalNotes, attempts, nextAt, "invalid_website_url") },
      });
      continue;
    }

    if (isBlockedClaimInviteDomain(siteHost)) {
      bump(byFailureReason, "blocked_aggregator_or_media_domain");
      failed += 1;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          internalNotes: withMineMeta(row.internalNotes, attempts, nextAt, "blocked_aggregator_or_media_domain"),
        },
      });
      continue;
    }

    const html = await discoveryFetchText(site);
    if (!html) {
      bump(byFailureReason, "contact_crawl_failed");
      failed += 1;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: { internalNotes: withMineMeta(row.internalNotes, attempts, nextAt, "contact_crawl_failed") },
      });
      continue;
    }

    const ex = extractFromHtml(site, html, { maxSameHostLinks: 56 });
    const deepFromLinks = rankVenueInternalUrls(ex.sameHostPaths ?? []).slice(0, 8);
    const deepFromGuesses = CONTACT_PATH_CANDIDATES.map((p) => absoluteSameHost(site, p)).filter(
      (u): u is string => Boolean(u),
    );
    const deepUrls = [...new Set([...deepFromLinks, ...deepFromGuesses])].slice(0, 10);

    let bestPrimary: string | null = null;
    let bestConfidence: "HIGH" | "MEDIUM" | "LOW" | null = null;
    let additional: string[] = [];
    let sawFreeMail = false;
    let sawMismatch = false;
    let sawAnyEmail = false;
    let followedContact = false;
    let followedTeam = false;

    const consider = (
      emailsTagged: Parameters<typeof pickPrimaryVenueOutreachEmail>[0],
      host: string | null,
    ) => {
      for (const t of emailsTagged) {
        sawAnyEmail = true;
        const parsedProbe = parseGrowthLeadEmailInput(t.email, { extractedFromNoisyText: true });
        if (parsedProbe.kind !== "valid" || !parsedProbe.normalized) continue;
        if (isFreeMailDomain(parsedProbe.normalized)) {
          sawFreeMail = true;
          continue;
        }
        if (isBlockedClaimInviteDomain(parsedProbe.normalized)) continue;
        if (!emailDomainMatchesSiteHost(parsedProbe.normalized, host)) {
          sawMismatch = true;
          continue;
        }
      }
      const picked = pickPrimaryVenueOutreachEmail(emailsTagged, host);
      if (!picked.primary) return;
      const sameHost = emailDomainMatchesSiteHost(picked.primary, host);
      if (!sameHost) return;
      if (isFreeMailDomain(picked.primary)) return;
      if (isBlockedClaimInviteDomain(picked.primary)) return;
      const local = picked.primary.split("@")[0] ?? "";
      const fromMailto = emailsTagged.some(
        (t) => t.email.toLowerCase() === picked.primary!.toLowerCase() && t.source === "mailto",
      );
      const forceHigh = ROLE_LOCAL.test(local) || fromMailto;
      const parsed = parseGrowthLeadEmailInput(picked.primary, {
        extractedFromNoisyText: forceHigh ? false : true,
      });
      if (parsed.kind !== "valid" || !parsed.normalized) return;
      const conf = forceHigh ? "HIGH" : parsed.confidence;
      const rank = (c: string | null) => (c === "HIGH" ? 3 : c === "MEDIUM" ? 2 : c === "LOW" ? 1 : 0);
      if (rank(conf) > rank(bestConfidence)) {
        bestPrimary = parsed.normalized;
        bestConfidence = conf;
        additional = picked.additional;
      }
    };

    consider(ex.emailsTagged, siteHost);
    for (const deep of deepUrls) {
      if (bestConfidence === "HIGH") break;
      try {
        const p = new URL(deep).pathname.toLowerCase();
        if (/contact|about/.test(p)) followedContact = true;
        if (/team|staff/.test(p)) followedTeam = true;
      } catch {
        /* ignore */
      }
      const deepHtml = await discoveryFetchText(deep);
      if (!deepHtml) continue;
      const deepEx = extractFromHtml(deep, deepHtml, { maxSameHostLinks: 24 });
      consider(deepEx.emailsTagged, siteHost);
    }

    if (!bestPrimary || !bestConfidence) {
      let reason = "same_domain_email_not_found";
      if (!sawAnyEmail) {
        if (!followedContact) reason = "contact_page_not_followed";
        else if (!followedTeam) reason = "staff_team_page_not_followed";
        else reason = "same_domain_email_not_found";
      } else if (sawFreeMail && !sawMismatch) reason = "only_free_mail_found";
      else if (sawMismatch) reason = "only_third_party_or_domain_mismatch";
      bump(byFailureReason, reason);
      failed += 1;
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: { internalNotes: withMineMeta(row.internalNotes, attempts, nextAt, reason) },
      });
      continue;
    }

    await persistGrowthLeadEmailContacts(prisma, {
      leadId: row.growthLead.id,
      leadName: row.growthLead.name || row.name,
      discoveryMarketSlug: row.growthLead.discoveryMarketSlug,
      source: row.growthLead.source,
      websiteUrl: row.growthLead.websiteUrl ?? site,
      confidence: row.growthLead.discoveryConfidence,
      primaryEmail: bestPrimary,
      additionalEmails: additional,
    });

    await prisma.growthLead.update({
      where: { id: row.growthLead.id },
      data: {
        contactEmailNormalized: bestPrimary,
        contactEmailRaw: bestPrimary,
        contactEmailConfidence: bestConfidence,
        contactEmailRejectionReason: null,
      },
    });

    const eligible = isStagedClaimInviteContactEligible({
      email: bestPrimary,
      confidence: bestConfidence,
      websiteUrl: site,
      sourceUrl: row.sourceUrl,
    });

    await prisma.publicOpenMicListing.update({
      where: { id: row.id },
      data: {
        claimInviteEmail: eligible ? bestPrimary : undefined,
        internalNotes: withMineMeta(
          row.internalNotes,
          attempts,
          nextAt,
          eligible ? "high_official_recovered" : "mined_non_high",
        ),
      },
    });

    if (eligible) highOfficial += 1;
    mined += 1;
  }

  if (scanThroughAt) {
    await writeDiscoveryCursor(prisma, MINE_ADAPTER, MINE_MARKET, MINE_CURSOR_KEY, scanThroughAt.toISOString());
  }

  return { scanned: needMine.length, mined, highOfficial, failed, byFailureReason };
}

/** Audit helper: classify why VERIFIED unclaimed rows are not invite-ready. */
export async function auditVerifiedContactMineBlockers(prisma: PrismaClient): Promise<{
  total: number;
  needingMine: number;
  reasons: Array<{ reason: string; count: number }>;
}> {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      verificationStatus: "VERIFIED",
      claimStatus: "UNCLAIMED",
      claimedVenueId: null,
      claimInviteEmailSentAt: null,
    },
    select: {
      websiteUrl: true,
      sourceUrl: true,
      googlePlaceId: true,
      internalNotes: true,
      growthLead: {
        select: { contactEmailNormalized: true, contactEmailConfidence: true, websiteUrl: true },
      },
    },
    take: 5000,
  });

  const reasons: Record<string, number> = {};
  let needingMine = 0;
  for (const row of rows) {
    const email = row.growthLead?.contactEmailNormalized;
    const conf = row.growthLead?.contactEmailConfidence;
    if (
      email &&
      conf &&
      isStagedClaimInviteContactEligible({
        email,
        confidence: conf,
        websiteUrl: row.websiteUrl || row.growthLead?.websiteUrl,
        sourceUrl: row.sourceUrl,
      })
    ) {
      continue;
    }
    needingMine += 1;
    if (!(row.websiteUrl || row.growthLead?.websiteUrl)) {
      bump(reasons, "no_website");
      continue;
    }
    const meta = parseMineMeta(row.internalNotes);
    if (meta.lastReason) {
      bump(reasons, meta.lastReason);
      continue;
    }
    if (!email) bump(reasons, "no_email_yet");
    else if (conf !== "HIGH") bump(reasons, `confidence_${conf ?? "null"}`);
    else bump(reasons, "high_but_not_same_domain_or_blocked");
  }

  return {
    total: rows.length,
    needingMine,
    reasons: Object.entries(reasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}
