import type { GrowthLeadType } from "@/generated/prisma/client";
import { MARKETING_TEMPLATE_KINDS } from "@/lib/marketing/templateKinds";

export function marketingTemplateKindForGrowthLeadType(t: GrowthLeadType): string {
  switch (t) {
    case "VENUE":
      return MARKETING_TEMPLATE_KINDS.GROWTH_LEAD_VENUE_OUTREACH;
    case "ARTIST":
      return MARKETING_TEMPLATE_KINDS.GROWTH_LEAD_ARTIST_OUTREACH;
    case "PROMOTER_ACCOUNT":
      return MARKETING_TEMPLATE_KINDS.GROWTH_LEAD_PROMOTER_OUTREACH;
    default:
      return MARKETING_TEMPLATE_KINDS.GROWTH_LEAD_VENUE_OUTREACH;
  }
}
