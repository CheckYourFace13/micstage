import { createHash } from "node:crypto";
import { MarketingContactStatus, MarketingJobKind } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";

function normUrl(v: string | null | undefined): string | null {
  const t = v?.trim();
  if (!t) return null;
  return t;
}

function uniqueEmails(raw: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const n = normalizeMarketingEmail(r ?? "");
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function pathKindForUrl(url: string): "CONTACT_PAGE" | "BOOKING_PAGE" | "EVENT_PAGE" | "SOCIAL_PATH" | "WEBSITE_PATH" {
  const lower = url.toLowerCase();
  if (/instagram\.com|facebook\.com|fb\.com|tiktok\.com|youtube\.com|youtu\.be/.test(lower)) return "SOCIAL_PATH";
  if (/book|booking|inquiry|inquire/.test(lower)) return "BOOKING_PAGE";
  if (/event|calendar|lineup|open-mic|openmic/.test(lower)) return "EVENT_PAGE";
  if (/contact|about/.test(lower)) return "CONTACT_PAGE";
  return "WEBSITE_PATH";
}

/**
 * Durable contact storage for growth venue discovery.
 * Reuses MarketingContact (email identity), preserving source + market + confidence metadata.
 */
export async function persistGrowthLeadEmailContacts(
  prisma: PrismaClient,
  input: {
    leadId: string;
    leadName: string;
    discoveryMarketSlug: string | null | undefined;
    source: string | null | undefined;
    websiteUrl: string | null | undefined;
    confidence: number | null | undefined;
    primaryEmail: string | null | undefined;
    additionalEmails?: string[] | null | undefined;
  },
): Promise<string[]> {
  const emails = uniqueEmails([input.primaryEmail, ...(input.additionalEmails ?? [])]);
  const linked: string[] = [];
  for (const email of emails) {
    const row = await prisma.marketingContact.upsert({
      where: { emailNormalized: email },
      create: {
        emailNormalized: email,
        displayName: input.leadName,
        discoveryMarketSlug: input.discoveryMarketSlug?.trim() || undefined,
        source: input.source?.trim() || "growth-lead",
        status: MarketingContactStatus.ACTIVE,
        notes: `Growth lead contact (${input.leadId})`,
        meta: {
          growth: {
            leadIds: [input.leadId],
            websiteUrl: input.websiteUrl ?? null,
            confidence: input.confidence ?? null,
          },
        },
      },
      update: {
        displayName: input.leadName,
        discoveryMarketSlug: input.discoveryMarketSlug?.trim() || undefined,
        source: input.source?.trim() || "growth-lead",
      },
      select: { id: true },
    });
    linked.push(row.id);
  }
  return linked;
}

/**
 * Creates automation-ready non-email outreach tasks in the existing MarketingJob queue.
 * This does not auto-submit forms yet; it records durable payloads for the next worker.
 */
export async function enqueueGrowthVenuePathTasks(
  prisma: PrismaClient,
  input: {
    leadId: string;
    discoveryMarketSlug: string | null | undefined;
    leadName: string;
    source: string | null | undefined;
    confidence: number | null | undefined;
    contactUrl: string | null | undefined;
    websiteUrl: string | null | undefined;
    instagramUrl: string | null | undefined;
    facebookUrl: string | null | undefined;
    hasAnyEmail: boolean;
  },
): Promise<number> {
  const urls = [
    normUrl(input.contactUrl),
    normUrl(input.websiteUrl),
    normUrl(input.instagramUrl),
    normUrl(input.facebookUrl),
  ].filter(Boolean) as string[];
  if (!urls.length) return 0;

  let created = 0;
  for (const targetUrl of [...new Set(urls)]) {
    const kind = pathKindForUrl(targetUrl);
    const digest = createHash("sha1").update(`${input.leadId}|${kind}|${targetUrl}`).digest("hex").slice(0, 16);
    const idempotencyKey = `growth:venue-path:${digest}`;
    // If email exists we still preserve paths, but mark them as fallback-ready.
    const payload = {
      leadId: input.leadId,
      leadName: input.leadName,
      leadType: "VENUE",
      pathKind: kind,
      targetUrl,
      fallbackOnly: input.hasAnyEmail,
      source: input.source ?? null,
      discoveryConfidence: input.confidence ?? null,
      state: "AUTO_READY",
    };

    await prisma.marketingJob.upsert({
      where: { idempotencyKey },
      create: {
        kind: MarketingJobKind.SOCIAL_PAYLOAD_RENDER,
        status: "PENDING",
        maxAttempts: 5,
        idempotencyKey,
        discoveryMarketSlug: input.discoveryMarketSlug?.trim() || null,
        payload,
      },
      update: {
        discoveryMarketSlug: input.discoveryMarketSlug?.trim() || null,
        payload,
      },
    });
    created++;
  }
  return created;
}
