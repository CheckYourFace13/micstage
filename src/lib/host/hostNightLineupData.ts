import { getPrismaOrNull } from "@/lib/prisma";

export type HostNightLineupContext = NonNullable<Awaited<ReturnType<typeof loadHostNightLineupContext>>>;

export async function loadHostNightLineupContext(nightId: string) {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;

  const night = await prisma.promoterNight.findUnique({
    where: { id: nightId },
    include: {
      series: {
        select: {
          name: true,
          promoter: { select: { displayName: true, hostSlug: true } },
        },
      },
      venue: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          region: true,
          timeZone: true,
          lat: true,
          lng: true,
        },
      },
      eventTemplate: {
        include: {
          instances: {
            where: { isCancelled: false },
            include: {
              slots: { orderBy: { startMin: "asc" }, include: { booking: true } },
            },
          },
        },
      },
      disputes: { where: { status: { in: ["PENDING", "SUPPRESSED"] } }, take: 1 },
    },
  });
  if (!night) return null;
  if (night.disputes.some((d) => d.status === "SUPPRESSED")) return null;

  const hostName = night.series.promoter.displayName?.trim() || "Host";
  const template = night.eventTemplate;
  const nightYmd = night.date.toISOString().slice(0, 10);
  const instance = template?.instances.find((i) => i.date.toISOString().slice(0, 10) === nightYmd) ?? null;

  return { night, hostName, template, instance };
}
