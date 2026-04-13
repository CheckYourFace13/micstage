import type { Prisma } from "@/generated/prisma/client";
import type { GrowthLeadListFilters } from "@/lib/growth/growthLeadFilters";

/**
 * Email / contact-quality–aware ordering: EMAIL tier and HIGH confidence surface first when browsing mixed queues.
 */
export function buildGrowthLeadOrderBy(f: GrowthLeadListFilters): Prisma.GrowthLeadOrderByWithRelationInput[] {
  const queue = f.outreachQueue ?? "all";
  const secondary =
    queue === "contact_path_queue" || queue === "social_path_queue" || queue === "website_only_queue";

  if (secondary) {
    return [{ fitScore: "desc" }, { createdAt: "desc" }];
  }

  return [
    { contactQuality: "asc" },
    { contactEmailConfidence: "asc" },
    { fitScore: "desc" },
    { createdAt: "desc" },
  ];
}
