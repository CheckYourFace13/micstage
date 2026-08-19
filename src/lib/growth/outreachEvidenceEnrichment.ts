/**
 * Tick-stage processor: crawl official venue sites for target-bound open-mic evidence,
 * promote Tier A/B, mine HIGH official contacts, and schedule bounded rechecks.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import { extractFromHtml, rankVenueInternalUrls } from "@/lib/growth/discovery/extractFromHtml";
import { pickPrimaryVenueOutreachEmail } from "@/lib/growth/discovery/venueEmailExtraction";
import { persistGrowthLeadEmailContacts } from "@/lib/growth/growthLeadContactAutomation";
import { parseGrowthLeadEmailInput } from "@/lib/growth/leadEmailValidation";
import { classifyOutreachTargetIdentity } from "@/lib/growth/outreachTargetIdentity";
import { countGrowthOpsInventory, ensureGrowthOpsMigration } from "@/lib/growth/growthOpsInventory";
import { classifyGrowthOpsState, scoreResearchPriority, type GrowthOpsState } from "@/lib/growth/growthOpsState";
import { emailDomainMatchesSiteHost } from "@/lib/publicListings/claimInviteEligibility";
import { isFreeMailDomain } from "@/lib/publicListings/claimAutoApproval";
import { isBlockedClaimInviteDomain } from "@/lib/publicListings/claimInviteAutomation";
import {
  classifyCrawledPagesForOutreach,
  excerptAroundOpenMic,
  expandOutreachEvidenceUrls,
  filterSameDomainUrls,
  isOutreachEvidenceRecheckDue,
  mergeCrawlUrlPlan,
  nextOutreachEvidenceRecheckAt,
  OUTREACH_EVIDENCE_CRAWL_TIMEOUT_MS,
  OUTREACH_EVIDENCE_LEAD_BUDGET_MS,
  OUTREACH_EVIDENCE_MAX_PAGES,
  parseOutreachEvidenceState,
  parseRobotsTxtForCrawler,
  permanentSkipReasonForLead,
  recheckKindFromEvidence,
  robotsAllowsUrl,
  socialFallbackUrl,
  type CrawledPage,
  type OutreachEvidenceState,
  detectRecurringLanguage,
  detectWeekdayTime,
} from "@/lib/growth/outreachEvidenceCrawl";
import { ingestHostLeadFromVenueEvidence } from "@/lib/growth/hostOutreachIngest";
import type { OutreachOpenMicEvidenceResult } from "@/lib/growth/outreachOpenMicEvidence";

export const OUTREACH_ENRICH_STATS_KEY = "GROWTH_OUTREACH_ENRICH_DAY_STATS";

const ROLE_LOCAL =
  /^(info|hello|contact|events?|bookings?|music|entertainment|manager|management|office|venue|host)$/i;

const CONTACT_PATHS = ["/contact", "/contact-us", "/about", "/booking", "/bookings"];

export type OutreachEnrichDayStats = {
  utcDay: string;
  candidatesChecked: number;
  officialSitesCrawled: number;
  newTierA: number;
  newTierB: number;
  manualReview: number;
  rejected: number;
  noEvidence: number;
  rechecksScheduled: number;
  domainsChecked: number;
  newHighContacts: number;
  newSendReady: number;
};

export type OutreachEvidenceEnrichResult = {
  processed: number;
  crawled: number;
  newTierA: number;
  newTierB: number;
  manualReview: number;
  rejected: number;
  noEvidence: number;
  rechecksScheduled: number;
  skippedDue: number;
  newHighContacts: number;
  newSendReady: number;
  skippedForBudget: boolean;
};

function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function emptyStats(utcDay: string): OutreachEnrichDayStats {
  return {
    utcDay,
    candidatesChecked: 0,
    officialSitesCrawled: 0,
    newTierA: 0,
    newTierB: 0,
    manualReview: 0,
    rejected: 0,
    noEvidence: 0,
    rechecksScheduled: 0,
    domainsChecked: 0,
    newHighContacts: 0,
    newSendReady: 0,
  };
}

export async function readOutreachEnrichDayStats(
  prisma: PrismaClient,
  now = new Date(),
): Promise<OutreachEnrichDayStats> {
  const day = utcDayKey(now);
  const row = await prisma.operationalRuntimeSetting.findUnique({
    where: { key: OUTREACH_ENRICH_STATS_KEY },
    select: { value: true },
  });
  if (!row?.value) return emptyStats(day);
  try {
    const parsed = JSON.parse(row.value) as Partial<OutreachEnrichDayStats>;
    if (parsed.utcDay !== day) return emptyStats(day);
    return { ...emptyStats(day), ...parsed, utcDay: day };
  } catch {
    return emptyStats(day);
  }
}

async function addOutreachEnrichDayStats(
  prisma: PrismaClient,
  delta: Partial<Omit<OutreachEnrichDayStats, "utcDay">>,
  now = new Date(),
): Promise<void> {
  const cur = await readOutreachEnrichDayStats(prisma, now);
  const next: OutreachEnrichDayStats = {
    utcDay: cur.utcDay,
    candidatesChecked: cur.candidatesChecked + (delta.candidatesChecked ?? 0),
    officialSitesCrawled: cur.officialSitesCrawled + (delta.officialSitesCrawled ?? 0),
    newTierA: cur.newTierA + (delta.newTierA ?? 0),
    newTierB: cur.newTierB + (delta.newTierB ?? 0),
    manualReview: cur.manualReview + (delta.manualReview ?? 0),
    rejected: cur.rejected + (delta.rejected ?? 0),
    noEvidence: cur.noEvidence + (delta.noEvidence ?? 0),
    rechecksScheduled: cur.rechecksScheduled + (delta.rechecksScheduled ?? 0),
    domainsChecked: cur.domainsChecked + (delta.domainsChecked ?? 0),
    newHighContacts: cur.newHighContacts + (delta.newHighContacts ?? 0),
    newSendReady: cur.newSendReady + (delta.newSendReady ?? 0),
  };
  await prisma.operationalRuntimeSetting.upsert({
    where: { key: OUTREACH_ENRICH_STATS_KEY },
    create: {
      key: OUTREACH_ENRICH_STATS_KEY,
      valueType: "json",
      value: JSON.stringify(next),
      updatedBy: "outreach-evidence-enrichment",
      reason: "daily_enrich_counters",
    },
    update: {
      valueType: "json",
      value: JSON.stringify(next),
      updatedBy: "outreach-evidence-enrichment",
      reason: "daily_enrich_counters",
    },
  });
}

function hintsRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  return {};
}

function buildEvidenceState(opts: {
  prev: OutreachEvidenceState | null;
  result: OutreachOpenMicEvidenceResult;
  snippet: string | null;
  title: string | null;
  sourceType: OutreachEvidenceState["sourceType"];
  skipPermanent: boolean;
  skipReason: string | null;
  now: Date;
  opsState: GrowthOpsState | null;
  crawled: boolean;
}): OutreachEvidenceState {
  const kind = opts.skipPermanent
    ? "permanent_skip"
    : recheckKindFromEvidence(opts.result, opts.crawled);
  const next = nextOutreachEvidenceRecheckAt(kind, opts.now);
  const firstSeen =
    opts.prev?.firstSeenAt && opts.result.tier === opts.prev.tier
      ? opts.prev.firstSeenAt
      : opts.result.autoSend || opts.result.tier === "A" || opts.result.tier === "B"
        ? opts.now.toISOString()
        : opts.prev?.firstSeenAt ?? null;
  const text = opts.snippet ?? "";
  return {
    url: opts.result.evidenceUrl,
    snippet: opts.snippet,
    title: opts.title,
    eventName: opts.result.matchedPhrase,
    recurringLanguage: detectRecurringLanguage(text),
    weekdayTime: detectWeekdayTime(text),
    sourceType: opts.sourceType,
    evidenceDate: opts.result.evidenceDate ?? opts.now.toISOString(),
    firstSeenAt: firstSeen,
    lastCheckedAt: opts.now.toISOString(),
    nextCheckAt: next.toISOString(),
    skipPermanent: opts.skipPermanent,
    skipReason: opts.skipReason,
    tier: opts.result.tier,
    confidence: opts.result.autoSend ? 90 : opts.result.tier === "C" ? 40 : 10,
    opsState: opts.opsState,
  };
}

async function writeLeadEvidence(prisma: PrismaClient, leadId: string, existingHints: unknown, state: OutreachEvidenceState): Promise<void> {
  const cur = hintsRecord(existingHints);
  cur.outreachEvidence = state;
  if (state.snippet) {
    cur.eventTitle = state.eventName ?? state.title;
    cur.evidenceSnippet = state.snippet;
    cur.sourceTitle = state.title;
    cur.openMicEvidence = state.snippet;
  }
  await prisma.growthLead.update({
    where: { id: leadId },
    data: { discoveryHints: cur as Prisma.InputJsonValue },
  });
}

const emptyResult = (): OutreachOpenMicEvidenceResult => ({
  tier: "none",
  autoSend: false,
  rejectClass: "no_target_bound_open_mic_evidence",
  summary: "skipped",
  evidenceUrl: null,
  evidenceDate: null,
  matchedPhrase: null,
  falsePositive: null,
});

async function persistListingEvidence(
  prisma: PrismaClient,
  listingId: string,
  result: OutreachOpenMicEvidenceResult,
  snippet: string | null,
  title: string | null,
  now: Date,
): Promise<void> {
  const url = result.evidenceUrl;
  if (!url) return;
  const official = result.tier === "A";
  const social = result.tier === "B";
  await prisma.listingOpenMicEvidence.upsert({
    where: { listingId_evidenceUrl: { listingId, evidenceUrl: url } },
    create: {
      listingId,
      evidenceUrl: url,
      sourceType: official ? "OFFICIAL_EVENTS_PAGE" : social ? "OFFICIAL_SOCIAL" : "OTHER",
      evidenceTitle: title?.slice(0, 180) ?? null,
      evidenceExcerpt: snippet?.slice(0, 500) ?? null,
      detectedPhrase: result.matchedPhrase,
      evidenceDate: now,
      fetchedAt: now,
      trusted: official,
      reviewOnly: !official,
      reasonCode: result.autoSend ? "official_current_open_mic" : result.rejectClass,
    },
    update: {
      sourceType: official ? "OFFICIAL_EVENTS_PAGE" : social ? "OFFICIAL_SOCIAL" : "OTHER",
      evidenceTitle: title?.slice(0, 180) ?? null,
      evidenceExcerpt: snippet?.slice(0, 500) ?? null,
      detectedPhrase: result.matchedPhrase,
      evidenceDate: now,
      fetchedAt: now,
      trusted: official,
      reviewOnly: !official,
      reasonCode: result.autoSend ? "official_current_open_mic" : result.rejectClass,
    },
  });
}

async function maybeMineOfficialEmail(
  prisma: PrismaClient,
  lead: {
    id: string;
    name: string;
    discoveryMarketSlug: string | null;
    source: string | null;
    websiteUrl: string | null;
    websiteHostNormalized: string | null;
    contactEmailNormalized: string | null;
    contactEmailConfidence: string | null;
    discoveryConfidence: number | null;
  },
  taggedEmails: { email: string; source: "mailto" | "body" | "header_footer" | "secondary_page" }[],
  extraPages: CrawledPage[],
): Promise<{ high: boolean; sendReady: boolean }> {
  if (lead.contactEmailConfidence === "HIGH" && lead.contactEmailNormalized) {
    return { high: false, sendReady: false };
  }
  const host = (lead.websiteHostNormalized || "").replace(/^www\./, "") || null;
  const allTagged = [
    ...taggedEmails,
    ...extraPages.flatMap((p) =>
      (p.text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []).map((email) => ({
        email,
        source: "body" as const,
      })),
    ),
  ];
  const picked = pickPrimaryVenueOutreachEmail(allTagged, host);
  if (!picked.primary || !host) return { high: false, sendReady: false };
  if (isFreeMailDomain(picked.primary) || isBlockedClaimInviteDomain(picked.primary)) {
    return { high: false, sendReady: false };
  }
  if (!emailDomainMatchesSiteHost(picked.primary, host)) return { high: false, sendReady: false };
  const local = picked.primary.split("@")[0] ?? "";
  const fromMailto = allTagged.some(
    (t) => t.email.toLowerCase() === picked.primary!.toLowerCase() && t.source === "mailto",
  );
  const forceHigh = ROLE_LOCAL.test(local) || fromMailto;
  const parsed = parseGrowthLeadEmailInput(picked.primary, { extractedFromNoisyText: !forceHigh });
  if (parsed.kind !== "valid" || parsed.confidence !== "HIGH") return { high: false, sendReady: false };

  await persistGrowthLeadEmailContacts(prisma, {
    leadId: lead.id,
    leadName: lead.name,
    discoveryMarketSlug: lead.discoveryMarketSlug,
    source: lead.source,
    websiteUrl: lead.websiteUrl,
    confidence: lead.discoveryConfidence,
    primaryEmail: parsed.normalized,
    additionalEmails: picked.additional,
  });
  await prisma.growthLead.update({
    where: { id: lead.id },
    data: {
      contactEmailNormalized: parsed.normalized,
      contactEmailRaw: parsed.normalized,
      contactEmailConfidence: "HIGH",
      contactEmailRejectionReason: null,
    },
  });
  return { high: true, sendReady: true };
}

type EnrichLeadRow = {
  id: string;
  name: string;
  leadType: "VENUE" | "PROMOTER_ACCOUNT" | "ARTIST";
  status: string;
  websiteUrl: string | null;
  websiteHostNormalized: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  contactEmailNormalized: string | null;
  contactEmailConfidence: string | null;
  city: string | null;
  region: string | null;
  discoveryMarketSlug: string | null;
  source: string | null;
  discoveryConfidence: number | null;
  fitScore: number | null;
  openMicSignalTier: string | null;
  discoveryHints: unknown;
  publicListings: Array<{
    id: string;
    name: string;
    websiteUrl: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    googlePlaceId: string | null;
    formattedAddress: string | null;
    city: string | null;
    region: string | null;
  }>;
};

async function crawlPages(
  urls: string[],
  timeoutMs: number,
  deadline: number,
): Promise<{ pages: CrawledPage[]; taggedEmails: { email: string; source: "mailto" | "body" | "header_footer" | "secondary_page" }[]; discoveredLinks: string[] }> {
  const pages: CrawledPage[] = [];
  const taggedEmails: { email: string; source: "mailto" | "body" | "header_footer" | "secondary_page" }[] = [];
  const discoveredLinks: string[] = [];
  for (const url of urls) {
    if (Date.now() >= deadline) break;
    const html = await discoveryFetchText(url, { timeoutMs });
    if (!html) continue;
    const ex = extractFromHtml(url, html, { maxSameHostLinks: 24 });
    taggedEmails.push(...(ex.emailsTagged ?? []));
    discoveredLinks.push(...(ex.sameHostPaths ?? []));
    pages.push({
      url,
      title: ex.nameGuess || "",
      text: ex.bodyTextSample || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 12_000),
    });
  }
  return { pages, taggedEmails, discoveredLinks };
}

/**
 * Process a bounded batch of HIGH venue/promoter candidates from the growth tick.
 */
export async function enrichGrowthLeadOfficialEvidence(
  prisma: PrismaClient,
  opts?: { limit?: number; budgetMs?: number },
): Promise<OutreachEvidenceEnrichResult> {
  const started = Date.now();
  const budgetMs = opts?.budgetMs ?? 14_000;
  const limit = Math.max(0, Math.min(12, opts?.limit ?? 4));
  const out: OutreachEvidenceEnrichResult = {
    processed: 0,
    crawled: 0,
    newTierA: 0,
    newTierB: 0,
    manualReview: 0,
    rejected: 0,
    noEvidence: 0,
    rechecksScheduled: 0,
    skippedDue: 0,
    newHighContacts: 0,
    newSendReady: 0,
    skippedForBudget: false,
  };
  if (limit <= 0) return out;

  await ensureGrowthOpsMigration(prisma);

  const rows = (await prisma.growthLead.findMany({
    where: {
      leadType: { in: ["VENUE", "PROMOTER_ACCOUNT"] },
      status: { in: ["DISCOVERED", "REVIEWED", "APPROVED"] },
      websiteUrl: { not: null },
    },
    select: {
      id: true,
      name: true,
      leadType: true,
      status: true,
      websiteUrl: true,
      websiteHostNormalized: true,
      facebookUrl: true,
      instagramUrl: true,
      contactEmailNormalized: true,
      contactEmailConfidence: true,
      city: true,
      region: true,
      discoveryMarketSlug: true,
      source: true,
      discoveryConfidence: true,
      fitScore: true,
      openMicSignalTier: true,
      discoveryHints: true,
      publicListings: {
        where: { removedAt: null },
        select: {
          id: true,
          name: true,
          websiteUrl: true,
          facebookUrl: true,
          instagramUrl: true,
          googlePlaceId: true,
          formattedAddress: true,
          city: true,
          region: true,
        },
        take: 2,
      },
    },
    orderBy: { updatedAt: "asc" },
    take: Math.max(150, limit * 20),
  })) as EnrichLeadRow[];

  const now = new Date();
  const scored = rows
    .map((row) => {
      const state = parseOutreachEvidenceState(row.discoveryHints);
      const listing = row.publicListings[0] ?? null;
      const hints =
        row.discoveryHints && typeof row.discoveryHints === "object" && !Array.isArray(row.discoveryHints)
          ? (row.discoveryHints as Record<string, unknown>)
          : {};
      const due = isOutreachEvidenceRecheckDue(state, now);
      const score = scoreResearchPriority({
        opsState: state?.opsState ?? null,
        skipPermanent: state?.skipPermanent === true,
        hasWebsite: Boolean(row.websiteUrl || listing?.websiteUrl),
        googlePlaceId: Boolean(listing?.googlePlaceId),
        openMicSignalTier: row.openMicSignalTier,
        contactHigh: row.contactEmailConfidence === "HIGH",
        evidenceAutoSend: state?.opsState === "AUTO_SEND_READY" || state?.tier === "A" || state?.tier === "B",
        leadType: row.leadType,
        hostOutreachLane: hints.hostOutreachLane === true,
        hostMultiVenueProspect: hints.hostMultiVenueProspect === true,
        hostIdentityDetected: Boolean(hints.hostBrand || hints.hostOutreachLane),
      });
      return { row, state, due, score };
    })
    .filter((x) => x.due && x.score >= 0)
    .sort((a, b) => b.score - a.score);
  out.skippedDue += Math.max(0, rows.length - scored.length);
  const due = scored.slice(0, limit).map((x) => x.row);

  const robotsCache = new Map<string, ReturnType<typeof parseRobotsTxtForCrawler> | null>();

  async function robotsForOrigin(websiteUrl: string): Promise<ReturnType<typeof parseRobotsTxtForCrawler> | null> {
    let origin: string;
    try {
      origin = new URL(websiteUrl.includes("://") ? websiteUrl : `https://${websiteUrl}`).origin;
    } catch {
      return null;
    }
    if (robotsCache.has(origin)) return robotsCache.get(origin) ?? null;
    const txt = await discoveryFetchText(`${origin}/robots.txt`, { timeoutMs: 5_000 });
    const rules = txt ? parseRobotsTxtForCrawler(txt) : { allow: [] as string[], disallow: [] as string[] };
    robotsCache.set(origin, rules);
    return rules;
  }

  for (const lead of due) {
    if (Date.now() - started > budgetMs - 1_500) {
      out.skippedForBudget = true;
      break;
    }
    out.processed += 1;
    const listing = lead.publicListings[0] ?? null;
    const skip = permanentSkipReasonForLead({
      name: lead.name,
      leadType: lead.leadType,
      websiteUrl: lead.websiteUrl,
      websiteHostNormalized: lead.websiteHostNormalized,
      contactEmailNormalized: lead.contactEmailNormalized,
      city: lead.city ?? listing?.city,
      region: lead.region ?? listing?.region,
      formattedAddress: listing?.formattedAddress,
      googlePlaceId: listing?.googlePlaceId,
      listingName: listing?.name,
    });
    const prev = parseOutreachEvidenceState(lead.discoveryHints);

    if (skip) {
      const ident = classifyOutreachTargetIdentity({
        name: lead.name,
        leadType: lead.leadType,
        websiteUrl: lead.websiteUrl,
        websiteHostNormalized: lead.websiteHostNormalized,
        contactEmailNormalized: lead.contactEmailNormalized,
        city: lead.city,
        googlePlaceId: listing?.googlePlaceId ?? null,
        formattedAddress: listing?.formattedAddress ?? null,
        listingName: listing?.name ?? null,
      });
      const ops = classifyGrowthOpsState({
        hardReject: skip,
        identityDecision: ident.decision,
        evidenceAutoSend: false,
        contactHigh: lead.contactEmailConfidence === "HIGH",
      });
      const state = buildEvidenceState({
        prev,
        result: emptyResult(),
        snippet: null,
        title: null,
        sourceType: "none",
        skipPermanent: ops.state === "HARD_REJECT",
        skipReason: skip,
        now,
        opsState: ops.state,
        crawled: false,
      });
      await writeLeadEvidence(prisma, lead.id, lead.discoveryHints, state);
      out.rejected += 1;
      continue;
    }

    const website = lead.websiteUrl || listing?.websiteUrl;
    if (!website) {
      const ident = classifyOutreachTargetIdentity({
        name: lead.name,
        leadType: lead.leadType,
        websiteUrl: lead.websiteUrl,
        websiteHostNormalized: lead.websiteHostNormalized,
        contactEmailNormalized: lead.contactEmailNormalized,
        city: lead.city,
        googlePlaceId: listing?.googlePlaceId ?? null,
        formattedAddress: listing?.formattedAddress ?? null,
        listingName: listing?.name ?? null,
      });
      const ops = classifyGrowthOpsState({
        hardReject: null,
        identityDecision: ident.decision,
        evidenceAutoSend: false,
        contactHigh: lead.contactEmailConfidence === "HIGH",
      });
      const state = buildEvidenceState({
        prev,
        result: emptyResult(),
        snippet: null,
        title: null,
        sourceType: "none",
        skipPermanent: false,
        skipReason: "no_website",
        now,
        opsState: ops.state,
        crawled: false,
      });
      await writeLeadEvidence(prisma, lead.id, lead.discoveryHints, state);
      out.noEvidence += 1;
      out.rechecksScheduled += 1;
      continue;
    }

    const leadDeadline = Math.min(started + budgetMs, Date.now() + OUTREACH_EVIDENCE_LEAD_BUDGET_MS);
    const robots = await robotsForOrigin(website);
    const seedUrls = expandOutreachEvidenceUrls(website, OUTREACH_EVIDENCE_MAX_PAGES);
    const allowedSeeds = robots ? seedUrls.filter((u) => robotsAllowsUrl(u, robots)) : seedUrls;

    const first = await crawlPages(allowedSeeds.slice(0, 2), OUTREACH_EVIDENCE_CRAWL_TIMEOUT_MS, leadDeadline);
    const ranked = rankVenueInternalUrls(first.discoveredLinks);
    const plan = mergeCrawlUrlPlan(website, ranked, OUTREACH_EVIDENCE_MAX_PAGES);
    const remaining = plan.filter((u) => !first.pages.some((p) => p.url.replace(/\/$/, "") === u.replace(/\/$/, "")));
    const allowedRemaining = robots
      ? filterSameDomainUrls(remaining, lead.websiteHostNormalized).filter((u) => robotsAllowsUrl(u, robots))
      : filterSameDomainUrls(remaining, lead.websiteHostNormalized);
    const rest = await crawlPages(allowedRemaining, OUTREACH_EVIDENCE_CRAWL_TIMEOUT_MS, leadDeadline);
    const pages = [...first.pages, ...rest.pages];
    const tagged = [...first.taggedEmails, ...rest.taggedEmails];
    out.crawled += 1;

    let result = classifyCrawledPagesForOutreach({
      name: lead.name,
      websiteUrl: lead.websiteUrl,
      websiteHostNormalized: lead.websiteHostNormalized,
      city: lead.city,
      region: lead.region,
      pages,
    });
    let sourceType: OutreachEvidenceState["sourceType"] = result.tier === "A" ? "official_website" : "none";

    const ident = classifyOutreachTargetIdentity({
      name: lead.name,
      leadType: lead.leadType,
      websiteUrl: lead.websiteUrl,
      websiteHostNormalized: lead.websiteHostNormalized,
      contactEmailNormalized: lead.contactEmailNormalized,
      city: lead.city,
      googlePlaceId: listing?.googlePlaceId ?? null,
      formattedAddress: listing?.formattedAddress ?? null,
      listingName: listing?.name ?? null,
    });
    const identityStrong =
      ident.decision === "eligible_venue" ||
      ident.decision === "eligible_promoter" ||
      Boolean(listing?.googlePlaceId);

    if (!result.autoSend && identityStrong) {
      const social = socialFallbackUrl({
        websiteUrl: lead.websiteUrl,
        facebookUrl: lead.facebookUrl || listing?.facebookUrl,
        instagramUrl: lead.instagramUrl || listing?.instagramUrl,
        identityStrong: true,
      });
      if (social && Date.now() < leadDeadline) {
        const socialCrawl = await crawlPages([social], OUTREACH_EVIDENCE_CRAWL_TIMEOUT_MS, leadDeadline);
        if (socialCrawl.pages.length) {
          const socialResult = classifyCrawledPagesForOutreach({
            name: lead.name,
            websiteUrl: lead.websiteUrl,
            websiteHostNormalized: lead.websiteHostNormalized,
            city: lead.city,
            region: lead.region,
            pages: socialCrawl.pages,
          });
          if (socialResult.tier === "B" || socialResult.autoSend) {
            result = {
              ...socialResult,
              tier: "B",
              autoSend: socialResult.autoSend,
              summary: `official social fallback: ${socialResult.matchedPhrase ?? socialResult.summary}`,
            };
            sourceType = "official_social";
          }
        }
      }
    }

    const pageForSnippet = pages.find((p) => p.url === result.evidenceUrl) ?? pages[0];
    const snippet = pageForSnippet ? excerptAroundOpenMic(pageForSnippet.text) : result.matchedPhrase;
    const title = pageForSnippet?.title ?? result.matchedPhrase;

    if (lead.leadType === "VENUE" && snippet && (result.tier === "A" || result.tier === "B")) {
      try {
        await ingestHostLeadFromVenueEvidence(prisma, {
          venueLeadId: lead.id,
          name: lead.name,
          snippet,
          eventName: title,
          sourceUrl: result.evidenceUrl ?? pageForSnippet?.url ?? lead.websiteUrl,
          city: lead.city,
          discoveryMarketSlug: lead.discoveryMarketSlug,
          contactEmail: lead.contactEmailNormalized,
        });
      } catch (e) {
        console.warn("[outreachEvidenceEnrichment] host_lane_ingest_skipped", lead.id, e instanceof Error ? e.message : e);
      }
    }

    if (result.tier === "A" && result.autoSend) {
      sourceType = "official_website";
      out.newTierA += 1;
      await prisma.growthLead.update({
        where: { id: lead.id },
        data: {
          openMicSignalTier: "EXPLICIT_OPEN_MIC",
          fitScore: Math.max(lead.fitScore ?? 0, 8),
        },
      });
    } else if (result.tier === "B") {
      out.newTierB += 1;
      if (result.autoSend) {
        await prisma.growthLead.update({
          where: { id: lead.id },
          data: {
            openMicSignalTier: "EXPLICIT_OPEN_MIC",
            fitScore: Math.max(lead.fitScore ?? 0, 7),
          },
        });
      }
    } else if (result.tier === "C") {
      out.manualReview += 1;
    } else if (result.rejectClass && result.rejectClass !== "no_target_bound_open_mic_evidence") {
      out.rejected += 1;
    } else {
      out.noEvidence += 1;
    }

    let contactHigh = lead.contactEmailConfidence === "HIGH";
    if ((result.tier === "A" || result.tier === "B") && result.autoSend) {
      let extraPages: CrawledPage[] = [];
      if (!contactHigh && Date.now() < leadDeadline) {
        try {
          const origin = new URL(website.includes("://") ? website : `https://${website}`).origin;
          const extraUrls = CONTACT_PATHS.map((p) => `${origin}${p}`).filter((u) => !robots || robotsAllowsUrl(u, robots));
          extraPages = (await crawlPages(extraUrls.slice(0, 3), OUTREACH_EVIDENCE_CRAWL_TIMEOUT_MS, leadDeadline)).pages;
        } catch {
          extraPages = [];
        }
      }
      const mined = await maybeMineOfficialEmail(prisma, lead, tagged, extraPages);
      if (mined.high) {
        out.newHighContacts += 1;
        contactHigh = true;
      }
    }

    const crawled = pages.length > 0;
    const ops = classifyGrowthOpsState({
      hardReject: null,
      identityDecision: ident.decision,
      evidenceAutoSend: result.autoSend,
      contactHigh,
    });
    if (ops.state === "AUTO_SEND_READY" && prev?.opsState !== "AUTO_SEND_READY") {
      out.newSendReady += 1;
    } else if (ops.state === "AUTO_RESEARCH_RETRY" && result.tier !== "C") {
      /* already counted via noEvidence / weak */
    }

    const state = buildEvidenceState({
      prev,
      result,
      snippet,
      title,
      sourceType,
      skipPermanent: false,
      skipReason: null,
      now,
      opsState: ops.state,
      crawled,
    });
    await writeLeadEvidence(prisma, lead.id, lead.discoveryHints, state);
    if (ops.state === "AUTO_RESEARCH_RETRY") out.rechecksScheduled += 1;

    if (listing && (result.tier === "A" || result.tier === "B")) {
      await persistListingEvidence(prisma, listing.id, result, snippet, title, now);
    }
  }

  await addOutreachEnrichDayStats(prisma, {
    candidatesChecked: out.processed,
    officialSitesCrawled: out.crawled,
    newTierA: out.newTierA,
    newTierB: out.newTierB,
    manualReview: out.manualReview,
    rejected: out.rejected,
    noEvidence: out.noEvidence,
    rechecksScheduled: out.rechecksScheduled,
    domainsChecked: out.crawled,
    newHighContacts: out.newHighContacts,
    newSendReady: out.newSendReady,
  });

  return out;
}
