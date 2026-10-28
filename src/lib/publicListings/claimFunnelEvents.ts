/**
 * Privacy-safe claim-funnel audit events. No email, name, token, or IP.
 */
import type { PrismaClient } from "@/generated/prisma/client";

export const CLAIM_FUNNEL_EVENT = {
  PAGE_VIEWED: "CLAIM_PAGE_VIEWED",
  ROLE_VENUE: "CLAIM_ROLE_SELECTED_VENUE",
  ROLE_HOST: "CLAIM_ROLE_SELECTED_HOST",
  FORM_STARTED: "CLAIM_FORM_STARTED",
  FORM_SUBMITTED: "CLAIM_FORM_SUBMITTED",
  COMPLETED: "CLAIM_COMPLETED",
  FAILED_VALIDATION: "CLAIM_FAILED_VALIDATION",
  FAILED_SESSION: "CLAIM_FAILED_SESSION",
  FAILED_OTHER: "CLAIM_FAILED_OTHER",
} as const;

export type ClaimFunnelEventName = (typeof CLAIM_FUNNEL_EVENT)[keyof typeof CLAIM_FUNNEL_EVENT];

export const CLAIM_FUNNEL_CLIENT_EVENTS = [
  "role_selected_venue",
  "role_selected_host",
  "claim_form_started",
] as const;

export type ClaimFunnelClientEvent = (typeof CLAIM_FUNNEL_CLIENT_EVENTS)[number];

const CLIENT_TO_AUDIT: Record<ClaimFunnelClientEvent, ClaimFunnelEventName> = {
  role_selected_venue: CLAIM_FUNNEL_EVENT.ROLE_VENUE,
  role_selected_host: CLAIM_FUNNEL_EVENT.ROLE_HOST,
  claim_form_started: CLAIM_FUNNEL_EVENT.FORM_STARTED,
};

export function claimFunnelEventFromClient(event: string): ClaimFunnelEventName | null {
  if ((CLAIM_FUNNEL_CLIENT_EVENTS as readonly string[]).includes(event)) {
    return CLIENT_TO_AUDIT[event as ClaimFunnelClientEvent];
  }
  return null;
}

export function claimFailureFunnelEvent(input: {
  status: number;
  error?: string | null;
}): ClaimFunnelEventName {
  const error = (input.error ?? "").toLowerCase();
  if (
    input.status === 401 ||
    error.includes("session") ||
    error.includes("invitation unavailable") ||
    error.includes("invitation session")
  ) {
    return CLAIM_FUNNEL_EVENT.FAILED_SESSION;
  }
  if (
    input.status === 400 ||
    error.includes("consent") ||
    error.includes("invalid") ||
    error.includes("required") ||
    error.includes("mismatch")
  ) {
    return CLAIM_FUNNEL_EVENT.FAILED_VALIDATION;
  }
  return CLAIM_FUNNEL_EVENT.FAILED_OTHER;
}

export type ClaimFunnelMeta = {
  listingSlug?: string | null;
  tokenId?: string | null;
  growthLeadId?: string | null;
  reason?: string | null;
  decision?: string | null;
};

export async function recordClaimFunnelEvent(
  prisma: PrismaClient,
  input: {
    listingId: string;
    eventType: ClaimFunnelEventName;
    meta?: ClaimFunnelMeta;
    /** Skip write if the same event+listing happened within this window. */
    dedupeMs?: number;
  },
): Promise<void> {
  if (input.dedupeMs && input.dedupeMs > 0) {
    const since = new Date(Date.now() - input.dedupeMs);
    const recent = await prisma.listingClaimAuditEvent.findFirst({
      where: {
        listingId: input.listingId,
        eventType: input.eventType,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) return;
  }

  await prisma.listingClaimAuditEvent.create({
    data: {
      listingId: input.listingId,
      eventType: input.eventType,
      meta: {
        listingSlug: input.meta?.listingSlug?.slice(0, 120) ?? null,
        hasToken: Boolean(input.meta?.tokenId),
        growthLeadId: input.meta?.growthLeadId ?? null,
        reason: input.meta?.reason?.slice(0, 80) ?? null,
        decision: input.meta?.decision?.slice(0, 40) ?? null,
      },
    },
  });
}
