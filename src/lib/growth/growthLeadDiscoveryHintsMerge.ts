import type { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

export async function mergeVenueDiscoveryHints(
  prisma: PrismaClient,
  leadId: string,
  incoming: Prisma.InputJsonValue | null | undefined,
): Promise<void> {
  if (incoming == null || typeof incoming !== "object" || Array.isArray(incoming)) return;
  const inc = incoming as Record<string, unknown>;
  const existing = await prisma.growthLead.findUnique({
    where: { id: leadId },
    select: { discoveryHints: true },
  });
  const cur =
    existing?.discoveryHints &&
    typeof existing.discoveryHints === "object" &&
    !Array.isArray(existing.discoveryHints)
      ? { ...(existing.discoveryHints as Record<string, unknown>) }
      : {};
  if (Array.isArray(inc.publicRoleHints)) {
    const prev = Array.isArray(cur.publicRoleHints) ? [...(cur.publicRoleHints as unknown[])] : [];
    for (const row of inc.publicRoleHints as unknown[]) {
      const sig = JSON.stringify(row);
      if (!prev.some((p) => JSON.stringify(p) === sig)) prev.push(row);
    }
    cur.publicRoleHints = prev.slice(0, 24);
  }
  for (const k of Object.keys(inc)) {
    if (k === "publicRoleHints") continue;
    if (cur[k] == null) (cur as Record<string, unknown>)[k] = inc[k];
  }
  await prisma.growthLead.update({
    where: { id: leadId },
    data: { discoveryHints: cur as Prisma.InputJsonValue },
  });
}
