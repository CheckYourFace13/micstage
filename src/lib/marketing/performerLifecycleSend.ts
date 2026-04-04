import type { PrismaClient } from "@/generated/prisma/client";
import { performerLifecycleEmailEnabled } from "@/lib/marketing/emailConfig";

/**
 * Opt-in performer lifecycle sends (gated by MARKETING_AUTO_PERFORMER_LIFECYCLE=true).
 * Phase: hook only — implement templates before enabling in production.
 */
export async function sendPerformerLifecycleEmailIfEnabled(
  _prisma: PrismaClient,
  _input: { musicianId: string; template: "WELCOME" | "PROFILE_TIP" },
): Promise<{ sent: false; reason: string }> {
  if (!performerLifecycleEmailEnabled()) {
    return { sent: false, reason: "MARKETING_AUTO_PERFORMER_LIFECYCLE not enabled" };
  }
  return { sent: false, reason: "Performer lifecycle templates not wired yet — enable after copy review" };
}
