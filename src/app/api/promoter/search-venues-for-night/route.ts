import { NextResponse } from "next/server";
import { getPromoterSessionOrNull } from "@/lib/authz";
import { getPrismaOrNull } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Venue search for scheduling host nights — any MicStage venue, no access approval required. */
export async function GET(request: Request) {
  const session = await getPromoterSessionOrNull();
  if (!session || session.kind !== "promoter") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }

  const venues = await prisma.venue.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { formattedAddress: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 12,
    select: { id: true, name: true, city: true, region: true, formattedAddress: true, slug: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    ok: true,
    results: venues.map((v) => ({
      venueId: v.id,
      name: v.name,
      place: v.formattedAddress || [v.city, v.region].filter(Boolean).join(", ") || null,
      slug: v.slug,
    })),
  });
}
