import { NextResponse } from "next/server";
import { formatMiles, haversineDistanceMiles } from "@/lib/geo";
import { getPrismaOrNull } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/public/venues/nearby?lat=..&lng=..
 * Returns MicStage venues sorted by distance. Venues without coordinates are listed last (no distance).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");
  const lat = latRaw != null ? Number.parseFloat(latRaw) : NaN;
  const lng = lngRaw != null ? Number.parseFloat(lngRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ ok: false, error: "lat and lng must be valid numbers" }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ ok: false, error: "lat/lng out of range" }, { status: 400 });
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "Unavailable" }, { status: 503 });
  }

  try {
    const venues = await prisma.venue.findMany({
      orderBy: { name: "asc" },
      select: {
        slug: true,
        name: true,
        city: true,
        region: true,
        formattedAddress: true,
        lat: true,
        lng: true,
      },
    });

    type Row = {
      slug: string;
      name: string;
      city: string | null;
      region: string | null;
      formattedAddress: string;
      distanceMiles: number | null;
      distanceLabel: string;
    };

    const withDist: Row[] = [];
    const noCoord: Row[] = [];

    for (const v of venues) {
      const base = {
        slug: v.slug,
        name: v.name,
        city: v.city,
        region: v.region,
        formattedAddress: v.formattedAddress,
      };
      if (v.lat != null && v.lng != null && Number.isFinite(v.lat) && Number.isFinite(v.lng)) {
        const d = haversineDistanceMiles(lat, lng, v.lat, v.lng);
        withDist.push({
          ...base,
          distanceMiles: d,
          distanceLabel: formatMiles(d),
        });
      } else {
        noCoord.push({
          ...base,
          distanceMiles: null,
          distanceLabel: "—",
        });
      }
    }

    withDist.sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
    noCoord.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(
      {
        ok: true,
        venues: [...withDist, ...noCoord],
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
