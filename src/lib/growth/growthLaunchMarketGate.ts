import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Growth outreach sends no longer hard-block on launch-market activation or missing `discoveryMarketSlug`.
 * Suppression, caps, and email validity are enforced elsewhere ({@link explainGrowthLeadOutreachBlock}, pipeline).
 *
 * @deprecated Parameters kept for call-site compatibility; return value is always allowed.
 */
export async function growthMarketAllowsOutboundSend(
  _prisma: PrismaClient,
  _discoveryMarketSlug: string | null | undefined,
): Promise<{ allowed: boolean; reason?: string }> {
  return { allowed: true };
}
