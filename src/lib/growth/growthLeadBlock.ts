import type { GrowthLeadStatus } from "@/generated/prisma/client";
import type { MarketingContact } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { explainMarketingSendBlock } from "@/lib/marketing/blockReasons";
import type { MicStageEmailCategory } from "@/lib/marketing/emailConfig";

export function growthLeadStatusBlocksOutreach(status: GrowthLeadStatus): string | null {
  switch (status) {
    case "JOINED":
      return "Lead status: JOINED (already a MicStage participant)";
    case "UNSUBSCRIBED":
    case "BOUNCED":
    case "REJECTED":
      return `Lead status: ${status}`;
    default:
      return null;
  }
}

export async function explainGrowthLeadOutreachBlock(
  prisma: PrismaClient,
  input: {
    leadStatus: GrowthLeadStatus;
    toEmail: string;
    contact: MarketingContact | null;
  },
): Promise<{ blocked: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  const gl = growthLeadStatusBlocksOutreach(input.leadStatus);
  if (gl) reasons.push(gl);
  const m = await explainMarketingSendBlock(prisma, {
    to: input.toEmail,
    category: "outreach" as MicStageEmailCategory,
    contact: input.contact,
  });
  if (m.blocked) reasons.push(...m.reasons);
  return { blocked: reasons.length > 0, reasons };
}
