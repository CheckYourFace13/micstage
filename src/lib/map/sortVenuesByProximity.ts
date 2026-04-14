import type { MapBoundsPayload } from "@/lib/map/openMicMapBounds";

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const rLat1 = toRad(aLat);
  const rLat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(rLat1) * Math.cos(rLat2);
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function centerOfBoundsPayload(b: MapBoundsPayload): { lat: number; lng: number } {
  return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
}

/** Sort by distance from map center (or tie-break by name). ~50m ties fall back to A–Z. */
export function sortVenuesByProximity<T extends { lat: number; lng: number; name: string }>(
  venues: T[],
  origin: { lat: number; lng: number },
): T[] {
  return [...venues].sort((a, b) => {
    const da = haversineKm(origin.lat, origin.lng, a.lat, a.lng);
    const db = haversineKm(origin.lat, origin.lng, b.lat, b.lng);
    if (Math.abs(da - db) < 0.05) return a.name.localeCompare(b.name);
    return da - db;
  });
}
