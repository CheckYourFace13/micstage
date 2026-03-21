import { redirect } from "next/navigation";
import { requirePrisma } from "@/lib/prisma";
import { getSession, type Session } from "@/lib/session";

export async function requireVenueSession() {
  const s = await getSession();
  if (!s || s.kind !== "venue") redirect("/login/venue");
  return s;
}

export async function requireMusicianSession() {
  const s = await getSession();
  if (!s || s.kind !== "musician") redirect("/login/musician");
  return s;
}

/** Venue IDs the signed-in venue owner/manager may act for; empty if not a venue session. */
export async function venueIdsForVenueSession(session: Session | null): Promise<string[]> {
  if (!session || session.kind !== "venue") return [];

  if (session.venueOwnerId) {
    const prisma = requirePrisma();
    const venues = await prisma.venue.findMany({
      where: { ownerId: session.venueOwnerId },
      select: { id: true },
    });
    return venues.map((v) => v.id);
  }

  if (session.venueManagerId) {
    const prisma = requirePrisma();
    const access = await prisma.venueManagerAccess.findMany({
      where: { managerId: session.venueManagerId },
      select: { venueId: true },
    });
    return access.map((a) => a.venueId);
  }

  return [];
}

export async function venueIdsForSession(session: Awaited<ReturnType<typeof requireVenueSession>>) {
  return venueIdsForVenueSession(session);
}

