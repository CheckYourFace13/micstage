import type { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Persist raw provider webhook payload for later processing (bounces, complaints).
 * Wire your Resend (or other) inbound webhook to a route that calls this.
 */
export async function recordMarketingProviderWebhook(
  prisma: PrismaClient,
  input: { provider: string; eventType: string; externalId?: string | null; payload: Prisma.InputJsonValue },
) {
  return prisma.marketingProviderWebhookEvent.create({
    data: {
      provider: input.provider,
      eventType: input.eventType,
      externalId: input.externalId ?? undefined,
      payload: input.payload,
    },
  });
}
