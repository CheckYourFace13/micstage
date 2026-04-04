import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";

type PrismaMarketingSubset = Pick<PrismaClient, "marketingContact" | "marketingEmailSuppression">;

/**
 * Enforced before outreach/marketing sends. Transactional mail uses separate checks in the send pipeline.
 */
export async function isMarketingEmailSuppressed(
  prisma: PrismaMarketingSubset,
  rawEmail: string,
): Promise<{ suppressed: boolean; reason?: string }> {
  const emailNormalized = normalizeMarketingEmail(rawEmail);
  if (!emailNormalized) return { suppressed: false };

  const globalRow = await prisma.marketingEmailSuppression.findUnique({
    where: { emailNormalized },
    select: { reason: true },
  });
  if (globalRow) return { suppressed: true, reason: globalRow.reason };

  const contact = await prisma.marketingContact.findUnique({
    where: { emailNormalized },
    select: {
      suppressedAt: true,
      suppressionReason: true,
      marketingUnsubscribedAt: true,
      status: true,
    },
  });
  if (!contact) return { suppressed: false };

  if (contact.status === "UNSUBSCRIBED" || contact.marketingUnsubscribedAt != null) {
    return { suppressed: true, reason: "UNSUBSCRIBE" };
  }
  if (contact.status === "BOUNCED" || (contact.suppressedAt != null && contact.suppressionReason === "HARD_BOUNCE")) {
    return { suppressed: true, reason: "HARD_BOUNCE" };
  }
  if (contact.status === "COMPLAINED" || (contact.suppressedAt != null && contact.suppressionReason === "COMPLAINT")) {
    return { suppressed: true, reason: "COMPLAINT" };
  }
  if (contact.status === "DO_NOT_CONTACT" || (contact.suppressedAt != null && contact.suppressionReason === "ADMIN_SUPPRESS")) {
    return { suppressed: true, reason: "ADMIN_SUPPRESS" };
  }
  if (contact.suppressedAt != null) {
    return { suppressed: true, reason: contact.suppressionReason ?? "ADMIN_SUPPRESS" };
  }
  return { suppressed: false };
}
