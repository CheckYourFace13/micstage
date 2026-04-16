import { NextResponse } from "next/server";
import { MarketingJobKind } from "@/generated/prisma/client";
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

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) return true;
  return request.headers.get("x-micstage-cron-secret") === expected;
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

  const job = await claimNextPendingMarketingJobOfKind(prisma, MarketingJobKind.SOCIAL_PAYLOAD_RENDER);
  if (!job) {
    return NextResponse.json(
      { ok: true, claimed: false, message: "No pending SOCIAL_PAYLOAD_RENDER jobs." },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const payload = (job.payload ?? null) as
    | null
    | {
        leadId?: string;
        leadName?: string;
        targetUrl?: string;
        discoveryConfidence?: number | null;
        source?: string | null;
      };

  const leadId = payload?.leadId?.trim() || "";
  const targetUrl = payload?.targetUrl?.trim() || "";
  const leadNameHint = payload?.leadName?.trim() || null;

  if (!leadId || !targetUrl) {
    await failMarketingJob(prisma, job.id, "Invalid job payload: missing leadId or targetUrl.", {
      actorEmail: "system:cron:marketing-social-payload-render",
    });
    return NextResponse.json(
      { ok: false, claimed: true, jobId: job.id, error: "invalid_payload" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
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
      return NextResponse.json(
        { ok: false, claimed: true, jobId: job.id, error: "lead_not_found" },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    const html = await discoveryFetchText(targetUrl);
    if (!html) {
      await failMarketingJob(prisma, job.id, "Fetch failed or non-HTML response.", {
        actorEmail: "system:cron:marketing-social-payload-render",
      });
      return NextResponse.json(
        { ok: true, claimed: true, jobId: job.id, leadId, targetUrl, extracted: false, reason: "fetch_failed" },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
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
    const primary = picked.primary;
    const additional = picked.additional;

    const parsed = parseGrowthLeadEmailInput(primary ?? "", { extractedFromNoisyText: true });
    const foundPrimary = parsed.kind === "valid" ? parsed.normalized : null;

    if (foundPrimary) {
      // Persist contact sidecars (MarketingContact) for reuse.
      await persistGrowthLeadEmailContacts(prisma, {
        leadId: lead.id,
        leadName: lead.name || leadNameHint || "Venue lead",
        discoveryMarketSlug: lead.discoveryMarketSlug,
        source: lead.source ?? payload?.source ?? null,
        websiteUrl: lead.websiteUrl ?? null,
        confidence: lead.discoveryConfidence ?? payload?.discoveryConfidence ?? null,
        primaryEmail: foundPrimary,
        additionalEmails: additional,
      });

      // Upgrade GrowthLead primary mailbox if not set yet.
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

      await completeMarketingJob(prisma, job.id, {
        actorEmail: "system:cron:marketing-social-payload-render",
      });

      return NextResponse.json(
        {
          ok: true,
          claimed: true,
          jobId: job.id,
          leadId,
          targetUrl,
          extracted: true,
          foundPrimaryEmail: foundPrimary,
          additionalEmailsFound: additional.length,
          bestSource: picked.bestSource,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    // No usable email found — mark succeeded so this job doesn't clog the queue.
    await completeMarketingJob(prisma, job.id, {
      actorEmail: "system:cron:marketing-social-payload-render",
    });
    return NextResponse.json(
      {
        ok: true,
        claimed: true,
        jobId: job.id,
        leadId,
        targetUrl,
        extracted: true,
        foundPrimaryEmail: null,
        additionalEmailsFound: additional.length,
        bestSource: picked.bestSource,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failMarketingJob(prisma, job.id, msg, { actorEmail: "system:cron:marketing-social-payload-render" });
    return NextResponse.json(
      { ok: false, claimed: true, jobId: job.id, error: msg.slice(0, 500) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

