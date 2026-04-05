import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Outbound cold sends (growth-lead drafts) are allowed only when the lead’s launch market row is ACTIVE.
 * Queued/paused markets may accumulate leads and drafts but must not send until activated.
 */
export async function growthMarketAllowsOutboundSend(
  prisma: PrismaClient,
  discoveryMarketSlug: string | null | undefined,
): Promise<{ allowed: boolean; reason?: string }> {
  const slug = discoveryMarketSlug?.trim();
  if (!slug) {
    return { allowed: false, reason: "Lead has no discovery market slug (outbound disabled)" };
  }
  const row = await prisma.growthLaunchMarket.findFirst({
    where: { discoveryMarketSlug: { equals: slug, mode: "insensitive" } },
    select: { status: true, label: true },
  });
  if (!row) {
    return {
      allowed: false,
      reason: `No launch market row for “${slug}” — add it under Launch markets or queue it before sending`,
    };
  }
  if (row.status !== "ACTIVE") {
    return {
      allowed: false,
      reason: `Launch market “${row.label ?? slug}” is ${row.status} (only ACTIVE markets may send outbound)`,
    };
  }
  return { allowed: true };
}
