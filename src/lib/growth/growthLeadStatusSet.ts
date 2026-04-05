import type { GrowthLeadStatus } from "@/generated/prisma/client";

export const GROWTH_LEAD_STATUS_SET = new Set<GrowthLeadStatus>([
  "DISCOVERED",
  "REVIEWED",
  "APPROVED",
  "CONTACTED",
  "REPLIED",
  "JOINED",
  "BOUNCED",
  "UNSUBSCRIBED",
  "REJECTED",
]);
