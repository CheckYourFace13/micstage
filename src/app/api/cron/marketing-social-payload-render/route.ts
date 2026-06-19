import { NextResponse } from "next/server";
import type { MarketingJob } from "@/generated/prisma/client";
import { MarketingJobKind } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { getPrismaOrNull } from "@/lib/prisma";
import {
  claimNextPendingMarketingJobOfKind,
  completeMarketingJob,
  failMarketingJob,
} from "@/lib/marketing/jobQueue";
import { discoveryFetchText } from "@/lib/growth/discovery/discoveryHttp";
import { extractFromHtml } from "@/lib/growth/discovery/extractFromHtml";
import { pickPrimaryVenueOutreachEmail } from "@/lib/growth/discovery/venueEmailExtraction";
import { persistGrowthLeadEmailContacts } from "@/lib/growth/growthLeadContactAutomation";
import { parseGrowthLeadEmailInput } from "@/lib/growth/leadEmailValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JobPayload = {
  leadId?: string;
  leadName?: string;
  targetUrl?: string;
  discoveryConfidence?: number | null;
  source?: string | null;
};

type JobRunResult =
  | { jobId: string; status: "no_job" }
  | { jobId: string; status: "invalid_payload" }
  | { jobId: string; status: "lead_not_found" }
  | { jobId: string; status: "fetch_failed"; leadId: string; targetUrl: string }
  | {
      jobId: string;
      status: "done";
      leadId: string;
      targetUrl: string;
      foundPrimaryEmail: string | null;
      additionalEmailsFound: number;
    }
  | { jobId: string; status: "error"; error: string };

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) return true;
  return request.headers.get("x-micstage-cron-secret") === expected;
}

function parseBatchSize(request: Request): number {
  const raw = new URL(request.url).searchParams.get("batch")?.trim();
  const fromEnv = process.env.MARKETING_SOCIAL_PAYLOAD_BATCH_PER_CRON?.trim();
  const n = Number.parseInt(raw || fromEnv || "20", 10);
  return Math.min(50, Math.max(1, Number.isFinite(n) ? n : 20));
}

async function processSocialPayloadJob(prisma: PrismaClient, job: MarketingJob): Promise<JobRunResult> {
  const payload = (job.payload ?? null) as JobPayload | null;
  const leadId = payload?.leadId?.trim() || "";
  const targetUrl = payload?.targetUrl?.trim() || "";
  const leadNameHint = payload?.leadName?.trim() || null;

  if (!leadId || !targetUrl) {
    await failMarketingJob(prisma, job.id, "Invalid job payload: missing leadId or targetUrl.", {
      actorEmail: "system:cron:marketing-social-payload-render",
    });
    return { jobId: job.id, status: "invalid_payload" };
  }

  try {
    const lead = await prisma.growthLead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        name: true,
        discoveryMarketSlug: true,
        source: true,
        websiteUrl: true,
        discoveryConfidence: true,
        contactEmailNormalized: true,
      },
    });
    if (!lead) {
      await failMarketingJob(prisma, job.id, `Growth lead not found (${leadId}).`, {
        actorEmail: "system:cron:marketing-social-payload-render",
      });
      return { jobId: job.id, status: "lead_not_found" };
    }

    const html = await discoveryFetchText(targetUrl);
    if (!html) {
      await failMarketingJob(prisma, job.id, "Fetch failed or non-HTML response.", {
        actorEmail: "system:cron:marketing-social-payload-render",
      });
      return { jobId: job.id, status: "fetch_failed", leadId, targetUrl };
    }

    const ex = extractFromHtml(targetUrl, html, { maxSameHostLinks: 40 });
    const pageHost = (() => {
      try {
        return new URL(targetUrl).hostname.replace(/^www\./i, "").toLowerCase();
      } catch {
        return null;
      }
    })();
    const picked = pickPrimaryVenueOutreachEmail(ex.emailsTagged, pageHost);
    const parsed = parseGrowthLeadEmailInput(picked.primary ?? "", { extractedFromNoisyText: true });
    const foundPrimary = parsed.kind === "valid" ? parsed.normalized : null;

    if (foundPrimary) {
      await persistGrowthLeadEmailContacts(prisma, {
        leadId: lead.id,
        leadName: lead.name || leadNameHint || "Venue lead",
        discoveryMarketSlug: lead.discoveryMarketSlug,
        source: lead.source ?? payload?.source ?? null,
        websiteUrl: lead.websiteUrl ?? null,
        confidence: lead.discoveryConfidence ?? payload?.discoveryConfidence ?? null,
        primaryEmail: foundPrimary,
        additionalEmails: picked.additional,
      });

      if (!lead.contactEmailNormalized?.trim()) {
        await prisma.growthLead.update({
          where: { id: lead.id },
          data: {
            contactEmailNormalized: foundPrimary,
            contactEmailRaw: parsed.kind === "valid" ? parsed.rawExtracted : foundPrimary,
            contactEmailConfidence: parsed.kind === "valid" ? parsed.confidence : null,
            contactEmailRejectionReason: null,
          },
        });
      }
    }

    await completeMarketingJob(prisma, job.id, {
      actorEmail: "system:cron:marketing-social-payload-render",
    });

    return {
      jobId: job.id,
      status: "done",
      leadId,
      targetUrl,
      foundPrimaryEmail: foundPrimary,
      additionalEmailsFound: picked.additional.length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failMarketingJob(prisma, job.id, msg, { actorEmail: "system:cron:marketing-social-payload-render" });
    return { jobId: job.id, status: "error", error: msg.slice(0, 500) };
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL not configured" }, { status: 503 });
  }

  const batchSize = parseBatchSize(request);
  const results: JobRunResult[] = [];
  let emailsFound = 0;

  for (let i = 0; i < batchSize; i++) {
    const job = await claimNextPendingMarketingJobOfKind(prisma, MarketingJobKind.SOCIAL_PAYLOAD_RENDER);
    if (!job) {
      if (results.length === 0) {
        return NextResponse.json(
          { ok: true, claimed: false, batchSize, message: "No pending SOCIAL_PAYLOAD_RENDER jobs." },
          { status: 200, headers: { "Cache-Control": "no-store" } },
        );
      }
      break;
    }
    const result = await processSocialPayloadJob(prisma, job);
    results.push(result);
    if (result.status === "done" && result.foundPrimaryEmail) emailsFound++;
  }

  const pendingRemaining = await prisma.marketingJob.count({
    where: { kind: MarketingJobKind.SOCIAL_PAYLOAD_RENDER, status: "PENDING" },
  });

  return NextResponse.json(
    {
      ok: true,
      batchSize,
      processed: results.length,
      emailsFound,
      pendingRemaining,
      results,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
