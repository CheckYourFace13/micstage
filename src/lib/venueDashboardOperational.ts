import type { Venue } from "@/generated/prisma/client";
import { requirePrisma } from "@/lib/prisma";
import type { LineupTemplate } from "@/lib/venuePublicLineupData";

/** Templates + instances/slots for lineup preview (matches public lineup picker inputs). */
const dashboardLineupTemplateInclude = {
  instances: {
    where: { isCancelled: false as const },
    orderBy: { date: "asc" as const },
    take: 90,
    include: {
      slots: { orderBy: { startMin: "asc" as const }, include: { booking: true as const } },
    },
  },
} as const;

/**
 * Venue is past bare registration: address + identity + at least one schedule template.
 * Used to switch the dashboard from onboarding emphasis to open-mic control center.
 */
export function venueIsOperational(
  venue: Pick<Venue, "formattedAddress" | "name" | "slug"> & { eventTemplates: readonly unknown[] },
): boolean {
  return (
    venue.eventTemplates.length >= 1 &&
    Boolean(venue.name?.trim()) &&
    Boolean(venue.slug?.trim()) &&
    Boolean(venue.formattedAddress?.trim())
  );
}

/** Load templates with enough instances for `pickPrimaryLineup` / share URLs (batched). */
export async function loadLineupTemplatesByVenueIds(
  venueIds: string[],
): Promise<Record<string, LineupTemplate[]>> {
  if (venueIds.length === 0) return {};
  const prisma = requirePrisma();
  const tpls = await prisma.eventTemplate.findMany({
    where: { venueId: { in: venueIds } },
    orderBy: [{ weekday: "asc" }, { startTimeMin: "asc" }],
    include: dashboardLineupTemplateInclude,
  });
  const out: Record<string, LineupTemplate[]> = {};
  for (const t of tpls) {
    const list = out[t.venueId] ?? [];
    list.push(t as unknown as LineupTemplate);
    out[t.venueId] = list;
  }
  return out;
}
