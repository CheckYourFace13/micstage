import { NextResponse } from "next/server";
import { venueIdsForVenueSession } from "@/lib/authz";
import { getPrismaOrNull } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * Venue-authenticated search of MicStage artist accounts (stage name only in response).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const venueId = (url.searchParams.get("venueId") ?? "").trim();
  if (!venueId) return NextResponse.json({ musicians: [] });

  const session = await getSession();
  const allowed = await venueIdsForVenueSession(session);
  if (!allowed.includes(venueId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (q.length < 2) {
    return NextResponse.json({ musicians: [] });
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ musicians: [] });
  }

  try {
    const musicians = await prisma.musicianUser.findMany({
      where: { stageName: { contains: q, mode: "insensitive" } },
      select: { id: true, stageName: true },
      take: 15,
      orderBy: { stageName: "asc" },
    });
    return NextResponse.json({ musicians });
  } catch {
    return NextResponse.json({ musicians: [] });
  }
}
