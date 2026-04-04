import type { MarketingContact, MarketingContactStatus } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { isMarketingEmailSuppressed } from "@/lib/marketing/suppression";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import type { MicStageEmailCategory } from "@/lib/marketing/emailConfig";

export type MarketingSendBlockExplanation = { blocked: boolean; reasons: string[] };

function statusBlocksOutreach(status: MarketingContactStatus): string | null {
  switch (status) {
    case "ACTIVE":
    case "REPLIED":
      return null;
    case "UNSUBSCRIBED":
      return "Contact status: UNSUBSCRIBED";
    case "BOUNCED":
      return "Contact status: BOUNCED";
    case "COMPLAINED":
      return "Contact status: COMPLAINED";
    case "DO_NOT_CONTACT":
      return "Contact status: DO_NOT_CONTACT";
    default:
      return `Contact status: ${status}`;
  }
}

/** Human-readable block reasons for admin UI and logs. */
export async function explainMarketingSendBlock(
  prisma: PrismaClient,
  input: {
    to: string;
    category: MicStageEmailCategory;
    contact: MarketingContact | null;
  },
): Promise<MarketingSendBlockExplanation> {
  const reasons: string[] = [];
  const email = normalizeMarketingEmail(input.to);
  if (!email) {
    return { blocked: true, reasons: ["Invalid email address"] };
  }

  if (input.category === "transactional") {
    if (input.contact) {
      if (input.contact.status === "BOUNCED") reasons.push("Contact status: BOUNCED (transactional blocked)");
      if (input.contact.status === "COMPLAINED") reasons.push("Contact status: COMPLAINED (transactional blocked)");
    }
    return { blocked: reasons.length > 0, reasons };
  }

  const sup = await isMarketingEmailSuppressed(prisma, email);
  if (sup.suppressed) {
    reasons.push(`Suppression: ${sup.reason ?? "blocked"}`);
  }
  if (input.contact) {
    const st = statusBlocksOutreach(input.contact.status);
    if (st) reasons.push(st);
  }

  return { blocked: reasons.length > 0, reasons };
}
