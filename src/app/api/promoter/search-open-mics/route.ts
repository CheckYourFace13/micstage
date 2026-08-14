import { NextResponse } from "next/server";
import { getPromoterSessionOrNull } from "@/lib/authz";
import { getPrismaOrNull } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Plain-language open mic / venue search for promoters (no slugs exposed).
 */
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

  const [venues, listings] = await Promise.all([
    prisma.venue.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
          { formattedAddress: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 8,
      select: { id: true, name: true, city: true, region: true, formattedAddress: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.publicOpenMicListing.findMany({
      where: {
        verificationStatus: { not: "OUTDATED" },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
          { formattedAddress: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 8,
      select: {
        id: true,
        name: true,
        city: true,
        region: true,
        formattedAddress: true,
        claimedVenueId: true,
        slug: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const results = [
    ...venues.map((v) => ({
      kind: "venue" as const,
      id: v.id,
      name: v.name,
      place: v.formattedAddress || [v.city, v.region].filter(Boolean).join(", ") || null,
      canRequestHostAccess: true,
      venueId: v.id,
    })),
    ...listings.map((l) => ({
      kind: "listing" as const,
      id: l.id,
      name: l.name,
      place: l.formattedAddress || [l.city, l.region].filter(Boolean).join(", ") || null,
      canRequestHostAccess: Boolean(l.claimedVenueId),
      venueId: l.claimedVenueId,
      listingPath: `/open-mics/${l.slug}`,
    })),
  ].slice(0, 12);

  return NextResponse.json({ ok: true, results });
}
