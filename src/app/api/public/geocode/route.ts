import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type NominatimHit = {
  lat: string;
  lon: string;
  display_name?: string;
};

/**
 * GET /api/public/geocode?zip=60601 or ?q=Chicago+IL
 * Server-side forward geocode (OpenStreetMap Nominatim). Use sparingly; respect OSM usage policy.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const zip = url.searchParams.get("zip")?.trim() ?? "";
  const q = url.searchParams.get("q")?.trim() ?? "";

  let nominatimUrl: string;
  if (zip) {
    const five = zip.replace(/\D/g, "").slice(0, 5);
    if (five.length !== 5) {
      return NextResponse.json({ ok: false, error: "Enter a 5-digit US ZIP code." }, { status: 400 });
    }
    nominatimUrl = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(five)}&countrycodes=us&format=json&limit=1`;
  } else if (q.length >= 2) {
    nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=us&format=json&limit=1`;
  } else {
    return NextResponse.json(
      { ok: false, error: "Provide zip (5 digits) or q (city, address, or metro)." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "MicStage/1.0 (https://micstage.app; open mic discovery)",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "Geocoding service unavailable." }, { status: 502 });
    }
    const data = (await res.json()) as NominatimHit[];
    const hit = data[0];
    if (!hit) {
      return NextResponse.json({ ok: false, error: "Location not found. Try a different ZIP or city." }, { status: 404 });
    }
    const lat = Number.parseFloat(hit.lat);
    const lng = Number.parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, error: "Invalid geocode response." }, { status: 502 });
    }
    return NextResponse.json(
      {
        ok: true,
        lat,
        lng,
        displayName: hit.display_name ?? null,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
