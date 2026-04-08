import type { PrismaClient } from "@/generated/prisma/client";
import { venueIdsForVenueSession } from "@/lib/authz";
import { unreadForMusician, unreadForVenue } from "@/lib/messaging/service";
import type { Session } from "@/lib/session";

export async function countUnreadThreads(prisma: PrismaClient, session: Session): Promise<number> {
  if (session.kind === "musician") {
    const threads = await prisma.messageThread.findMany({
      where: { musicianId: session.musicianId },
      select: {
        lastReadByMusicianAt: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, senderSide: true } },
      },
    });
    return threads.filter((t) => unreadForMusician(t)).length;
  }
  if (session.kind === "venue") {
    const ids = await venueIdsForVenueSession(session);
    if (!ids.length) return 0;
    const threads = await prisma.messageThread.findMany({
      where: { venueId: { in: ids } },
      select: {
        lastReadByVenueAt: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, senderSide: true } },
      },
    });
    return threads.filter((t) => unreadForVenue(t)).length;
  }
  return 0;
}
