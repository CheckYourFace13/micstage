#!/usr/bin/env node
/**
 * Read-only growth outreach diagnostic — run where DATABASE_URL is available.
 *   node scripts/diagnose-growth-outreach.mjs
 */
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";

function loadEnvFile(name) {
  if (!fs.existsSync(name)) return;
  for (const line of fs.readFileSync(name, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim() ||
  "";

if (!url) {
  console.error("No DATABASE_URL — set it or run on the Hostinger app host.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

function flag(name) {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

async function main() {
  const since = startOfUtcDay();
  const [
    totalLeads,
    venueLeads,
    artistLeads,
    highEmail,
    mediumEmail,
    lowEmail,
    noEmail,
    pendingDrafts,
    approvedDrafts,
    sentDraftsToday,
    outreachSentToday,
    joinedLeads,
    venues,
    musicians,
    pendingSocialJobs,
    draftErrors,
    lastDiscoveryRun,
  ] = await Promise.all([
    prisma.growthLead.count(),
    prisma.growthLead.count({ where: { leadType: "VENUE" } }),
    prisma.growthLead.count({ where: { leadType: "ARTIST" } }),
    prisma.growthLead.count({ where: { contactEmailConfidence: "HIGH" } }),
    prisma.growthLead.count({ where: { contactEmailConfidence: "MEDIUM" } }),
    prisma.growthLead.count({ where: { contactEmailConfidence: "LOW" } }),
    prisma.growthLead.count({ where: { contactEmailNormalized: null } }),
    prisma.growthLeadOutreachDraft.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.growthLeadOutreachDraft.count({ where: { status: "APPROVED", marketingEmailSendId: null } }),
    prisma.growthLeadOutreachDraft.count({ where: { status: "SENT", sentAt: { gte: since } } }),
    prisma.marketingEmailSend.count({ where: { category: "OUTREACH", status: "SENT", sentAt: { gte: since } } }),
    prisma.growthLead.count({ where: { status: "JOINED" } }),
    prisma.venue.count(),
    prisma.musicianUser.count(),
    prisma.marketingJob.count({ where: { kind: "SOCIAL_PAYLOAD_RENDER", status: "PENDING" } }),
    prisma.growthLeadOutreachDraft.findMany({
      where: { lastError: { not: null } },
      select: { lastError: true },
      take: 500,
    }),
    prisma.growthDiscoveryRun.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, created: true } }),
  ]);

  const errorCounts = {};
  for (const row of draftErrors) {
    const k = (row.lastError ?? "").slice(0, 120);
    errorCounts[k] = (errorCounts[k] ?? 0) + 1;
  }
  const topErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  console.log("=== MicStage growth outreach diagnostic ===\n");
  console.log("Env flags (process env on this host):");
  console.log("  GROWTH_LEAD_DISCOVERY_CRON_ENABLED:", flag("GROWTH_LEAD_DISCOVERY_CRON_ENABLED"));
  console.log("  GROWTH_AUTO_DRAFT_CRON_ENABLED:", flag("GROWTH_AUTO_DRAFT_CRON_ENABLED"));
  console.log("  GROWTH_OUTREACH_ALLOW_MEDIUM_CONFIDENCE:", flag("GROWTH_OUTREACH_ALLOW_MEDIUM_CONFIDENCE"));
  console.log("  RESEND_API_KEY set:", Boolean(process.env.RESEND_API_KEY?.trim()));
  console.log("  CRON_SECRET set:", Boolean(process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim()));
  console.log("  GROWTH_OUTREACH_SENDS_PER_CRON_RUN:", process.env.GROWTH_OUTREACH_SENDS_PER_CRON_RUN ?? "(default 3)");
  console.log("");
  console.log("Leads:", { totalLeads, venueLeads, artistLeads, joinedLeads });
  console.log("Email quality:", { highEmail, mediumEmail, lowEmail, noEmail });
  console.log("Drafts:", { pendingDrafts, approvedBacklog: approvedDrafts, sentDraftsToday });
  console.log("Outreach sends today (UTC):", outreachSentToday);
  console.log("Signups:", { venues, musicians });
  console.log("Pending social email extraction jobs:", pendingSocialJobs);
  if (lastDiscoveryRun) {
    console.log("Last discovery run:", lastDiscoveryRun.createdAt.toISOString(), "created:", lastDiscoveryRun.created);
  } else {
    console.log("Last discovery run: none recorded");
  }
  if (topErrors.length) {
    console.log("\nTop draft send errors:");
    for (const [msg, n] of topErrors) console.log(`  (${n}) ${msg}`);
  }

  console.log("\n--- Recommendations ---");
  if (!flag("GROWTH_AUTO_DRAFT_CRON_ENABLED")) {
    console.log("• Set GROWTH_AUTO_DRAFT_CRON_ENABLED=true — outreach automation is OFF.");
  }
  if (!flag("GROWTH_LEAD_DISCOVERY_CRON_ENABLED")) {
    console.log("• Set GROWTH_LEAD_DISCOVERY_CRON_ENABLED=true — discovery cron is OFF.");
  }
  if (outreachSentToday < 5 && approvedDrafts > 0) {
    console.log("• Approved draft backlog exists but few sends today — check cron schedule and Resend/EMAIL_FROM.");
  }
  if (highEmail + mediumEmail < 10) {
    console.log("• Few mailable leads — import CSV via /internal/admin/growth or enable discovery API keys.");
  }
  if (pendingDrafts > 20 && outreachSentToday === 0) {
    console.log("• Many pending drafts, zero sends — likely MEDIUM confidence blocked or cron not running.");
  }
  console.log("\nFull ops guide: docs/GROWTH_PIPELINE.md");
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
