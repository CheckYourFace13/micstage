import { NextResponse } from "next/server";
import { loadNearbyDiscoveryRows } from "@/lib/publicListings/discoveryMerge";
import { getPrismaOrNull } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/public/venues/nearby?lat=..&lng=..
 * Returns claimed venues and verified public listings sorted by distance.
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
    const venues = await loadNearbyDiscoveryRows(prisma, lat, lng);
    return NextResponse.json(
      { ok: true, venues },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
