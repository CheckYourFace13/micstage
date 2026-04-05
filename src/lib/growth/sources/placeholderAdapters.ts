import type { GrowthLeadType } from "@/generated/prisma/client";
import type { GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";

/** Reserved for future contact-page crawlers; returns no rows until implemented. */
export function createEmptyAdapter(id: string, leadType: GrowthLeadType): GrowthLeadSourceAdapter {
  return {
    id,
    leadType,
    discover: async () => [],
  };
}
