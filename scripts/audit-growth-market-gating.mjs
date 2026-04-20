#!/usr/bin/env node
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    includeApproved: !argv.includes("--pending-only"),
  };
}

function normalizeSlug(value) {
  return (value ?? "").trim().toLowerCase();
}

function readDatabaseUrl() {
  const fromEnv = (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.PRISMA_DATABASE_URL ??
    ""
  ).trim();
  if (fromEnv) return fromEnv;

  if (!fs.existsSync(".env")) return "";
  const envText = fs.readFileSync(".env", "utf8");
  const match = envText.match(/^DATABASE_URL\s*=\s*"?(.*?)"?\s*$/m);
  return (match?.[1] ?? "").trim();
}

function chooseCanonicalSlug(raw, launchByNorm) {
  const norm = normalizeSlug(raw);
  if (!norm) return null;
  return launchByNorm.get(norm)?.discoveryMarketSlug ?? norm;
}

function resolveTargetSlug(leadSlugRaw, draftSlugRaw, launchByNorm) {
  const leadNorm = normalizeSlug(leadSlugRaw);
  const draftNorm = normalizeSlug(draftSlugRaw);
  const leadCanonical = chooseCanonicalSlug(leadSlugRaw, launchByNorm);
  const draftCanonical = chooseCanonicalSlug(draftSlugRaw, launchByNorm);
  const leadKnown = Boolean(leadNorm && launchByNorm.has(leadNorm));
  const draftKnown = Boolean(draftNorm && launchByNorm.has(draftNorm));

  if (leadCanonical && !draftCanonical) return leadCanonical;
  if (!leadCanonical && draftCanonical) return draftCanonical;
  if (!leadCanonical && !draftCanonical) return null;
  if (leadNorm === draftNorm) return leadCanonical;

  if (leadKnown && !draftKnown) return leadCanonical;
  if (!leadKnown && draftKnown) return draftCanonical;
  return leadCanonical;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const url = readDatabaseUrl();
  if (!url) {
    throw new Error("No DATABASE_URL found in env or .env");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  try {
    const markets = await prisma.growthLaunchMarket.findMany({
      select: { discoveryMarketSlug: true, status: true, label: true },
      orderBy: { discoveryMarketSlug: "asc" },
    });
    const activeSet = new Set(
      markets.filter((m) => m.status === "ACTIVE").map((m) => normalizeSlug(m.discoveryMarketSlug)),
    );
    const launchByNorm = new Map(markets.map((m) => [normalizeSlug(m.discoveryMarketSlug), m]));

    const drafts = await prisma.growthLeadOutreachDraft.findMany({
      where: {
        status: opts.includeApproved ? { in: ["PENDING_REVIEW", "APPROVED"] } : "PENDING_REVIEW",
        marketingEmailSendId: null,
        lead: { leadType: "VENUE" },
      },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            discoveryMarketSlug: true,
            status: true,
            contactEmailConfidence: true,
            fitScore: true,
            openMicSignalTier: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 10000,
    });

    const report = {
      totalDrafts: drafts.length,
      leadSlugNull: 0,
      draftSlugNull: 0,
      leadDraftMismatch: 0,
      noKnownLaunchMarket: 0,
      notActiveMarket: 0,
      leadOnlyWouldSkipInVenueAutoPath: 0,
      activeMarketReadyByEffectiveSlug: 0,
    };

    const affectedRows = [];
    const affectedSlugs = new Set();
    const bySlug = new Map();
    const autoVenueEligibleStatus = new Set(["DISCOVERED", "REVIEWED", "APPROVED"]);
    const fitMinRaw = process.env.GROWTH_AUTO_DRAFT_FIT_MIN?.trim();
    const fitMinParsed = fitMinRaw ? Number.parseInt(fitMinRaw, 10) : 7;
    const fitMin = Number.isFinite(fitMinParsed) ? fitMinParsed : 7;
    const venueAutoFitMin = Math.max(6, fitMin - 1); // match growthDraftAutomation.ts
    const allowMediumOutreach = process.env.GROWTH_OUTREACH_ALLOW_MEDIUM_CONFIDENCE === "true";
    const activePendingBlockers = {
      totalPendingActive: 0,
      missingOrBadConfidence: 0,
      lowConfidence: 0,
      mediumConfidenceRequiresEnv: 0,
      statusNotEligible: 0,
      tierNotEligible: 0,
      fitBelowVenueAutoMin: 0,
      fullyEligibleNow: 0,
    };
    for (const d of drafts) {
      const leadNorm = normalizeSlug(d.lead.discoveryMarketSlug);
      const draftNorm = normalizeSlug(d.discoveryMarketSlug);
      const effectiveNorm = draftNorm || leadNorm;

      if (!leadNorm) report.leadSlugNull++;
      if (!draftNorm) report.draftSlugNull++;
      if (leadNorm && draftNorm && leadNorm !== draftNorm) report.leadDraftMismatch++;
      if (!effectiveNorm || !launchByNorm.has(effectiveNorm)) report.noKnownLaunchMarket++;
      if (!effectiveNorm || !activeSet.has(effectiveNorm)) report.notActiveMarket++;
      if (!leadNorm && draftNorm) report.leadOnlyWouldSkipInVenueAutoPath++;
      if (effectiveNorm && activeSet.has(effectiveNorm)) report.activeMarketReadyByEffectiveSlug++;
      if (d.status === "PENDING_REVIEW" && effectiveNorm && activeSet.has(effectiveNorm)) {
        activePendingBlockers.totalPendingActive++;
        const conf = d.lead.contactEmailConfidence ?? null;
        const confOk = conf === "HIGH" || (allowMediumOutreach && conf === "MEDIUM");
        const statusOk = autoVenueEligibleStatus.has(d.lead.status);
        const tier = d.lead.openMicSignalTier ?? null;
        const tierOkForDiscovered =
          d.lead.status !== "DISCOVERED" ||
          tier === "EXPLICIT_OPEN_MIC" ||
          tier === "STRONG_LIVE_EVENT";
        const fitOk = (d.lead.fitScore ?? 0) >= venueAutoFitMin;
        if (!confOk) activePendingBlockers.missingOrBadConfidence++;
        if (conf === "LOW") activePendingBlockers.lowConfidence++;
        if (conf === "MEDIUM" && !allowMediumOutreach) activePendingBlockers.mediumConfidenceRequiresEnv++;
        if (!statusOk) activePendingBlockers.statusNotEligible++;
        if (!tierOkForDiscovered) activePendingBlockers.tierNotEligible++;
        if (!fitOk) activePendingBlockers.fitBelowVenueAutoMin++;
        if (confOk && statusOk && tierOkForDiscovered && fitOk) activePendingBlockers.fullyEligibleNow++;
      }

      const key = effectiveNorm || "(missing)";
      const row = bySlug.get(key) ?? {
        slug: key,
        launchStatus: key === "(missing)" ? "MISSING" : launchByNorm.get(key)?.status ?? "NO_ROW",
        totalDrafts: 0,
        pendingReview: 0,
        approvedUnsent: 0,
        autoVenueEligibleNow: 0,
      };
      row.totalDrafts++;
      if (d.status === "PENDING_REVIEW") row.pendingReview++;
      if (d.status === "APPROVED") row.approvedUnsent++;
      const confOk =
        d.lead.contactEmailConfidence === "HIGH" ||
        (allowMediumOutreach && d.lead.contactEmailConfidence === "MEDIUM");
      const statusOk = autoVenueEligibleStatus.has(d.lead.status);
      const tier = d.lead.openMicSignalTier ?? null;
      const tierOkForDiscovered =
        d.lead.status !== "DISCOVERED" ||
        tier === "EXPLICIT_OPEN_MIC" ||
        tier === "STRONG_LIVE_EVENT";
      const fitOk = (d.lead.fitScore ?? 0) >= venueAutoFitMin;
      if (d.status === "PENDING_REVIEW" && confOk && statusOk && tierOkForDiscovered && fitOk) {
        row.autoVenueEligibleNow++;
      }
      bySlug.set(key, row);

      const targetSlug = resolveTargetSlug(d.lead.discoveryMarketSlug, d.discoveryMarketSlug, launchByNorm);
      const targetNorm = normalizeSlug(targetSlug);
      const needsLeadUpdate = targetSlug && normalizeSlug(d.lead.discoveryMarketSlug) !== targetNorm;
      const needsDraftUpdate = targetSlug && normalizeSlug(d.discoveryMarketSlug) !== targetNorm;

      if (needsLeadUpdate || needsDraftUpdate) {
        if (targetSlug) affectedSlugs.add(targetSlug);
        affectedRows.push({
          draftId: d.id,
          leadId: d.lead.id,
          leadName: d.lead.name,
          fromLeadSlug: d.lead.discoveryMarketSlug,
          fromDraftSlug: d.discoveryMarketSlug,
          targetSlug,
          leadStatus: d.lead.status,
          confidence: d.lead.contactEmailConfidence,
        });
      }
    }

    let applied = 0;
    if (opts.apply) {
      for (const row of affectedRows) {
        await prisma.$transaction([
          prisma.growthLead.update({
            where: { id: row.leadId },
            data: { discoveryMarketSlug: row.targetSlug },
          }),
          prisma.growthLeadOutreachDraft.update({
            where: { id: row.draftId },
            data: { discoveryMarketSlug: row.targetSlug },
          }),
        ]);
        applied++;
      }
    }

    console.log(
      JSON.stringify(
        {
          apply: opts.apply,
          includeApproved: opts.includeApproved,
          activeMarketCount: activeSet.size,
          launchMarkets: markets,
          report,
          affectedCount: affectedRows.length,
          affectedSlugs: [...affectedSlugs].sort(),
          nonActiveOrMissingMarketsByDraftCount: [...bySlug.values()]
            .filter((r) => r.launchStatus !== "ACTIVE")
            .sort((a, b) => b.totalDrafts - a.totalDrafts)
            .slice(0, 50),
          activeMarketsByDraftCount: [...bySlug.values()]
            .filter((r) => r.launchStatus === "ACTIVE")
            .sort((a, b) => b.totalDrafts - a.totalDrafts),
          activePendingAutoVenueBlockers: activePendingBlockers,
          venueAutoFitMin,
          sampleAffectedRows: affectedRows.slice(0, 40),
          applied,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
