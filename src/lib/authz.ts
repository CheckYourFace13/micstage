import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

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

export async function venueIdsForSession(session: Awaited<ReturnType<typeof requireVenueSession>>) {
  if (session.venueOwnerId) {
    const venues = await prisma.venue.findMany({
      where: { ownerId: session.venueOwnerId },
      select: { id: true },
    });
    return venues.map((v) => v.id);
  }

  if (session.venueManagerId) {
    const access = await prisma.venueManagerAccess.findMany({
      where: { managerId: session.venueManagerId },
      select: { venueId: true },
    });
    return access.map((a) => a.venueId);
  }

  return [];
}

