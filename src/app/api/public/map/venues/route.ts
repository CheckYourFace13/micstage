import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";

/** Shared CDN TTL for map marker JSON (seconds). Booking-sensitive fields may be up to this stale. */
const MAP_VENUES_S_MAXAGE = 300;

/**
 * Public map marker payload. Cached at the CDN; not personalized.
 * Live booking availability is best-effort within s-maxage — not a booking API.
 */
export async function GET() {
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json(
      { venues: [], error: "unavailable" },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  }

  try {
    const { loadMergedOpenMicMapVenues } = await import("@/lib/map/loadPublicListingMapVenues");
    const venues = await loadMergedOpenMicMapVenues(prisma);
    return NextResponse.json(
      { venues, generatedAt: new Date().toISOString(), count: venues.length },
      {
        headers: {
          // Browser revalidates; CDN may serve shared copy up to MAP_VENUES_S_MAXAGE.
          "Cache-Control": `public, max-age=0, s-maxage=${MAP_VENUES_S_MAXAGE}, stale-while-revalidate=86400`,
        },
      },
    );
  } catch (e) {
    console.error("[api public map venues]", e);
    return NextResponse.json(
      { venues: [], error: "server_error" },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  }
}
