import type { LatLngBoundsLiteral } from "leaflet";

export type MapBoundsPayload = { south: number; west: number; north: number; east: number };

export function payloadFromLeafletBounds(b: { getSouth: () => number; getWest: () => number; getNorth: () => number; getEast: () => number }): MapBoundsPayload {
  return {
    south: b.getSouth(),
    west: b.getWest(),
    north: b.getNorth(),
    east: b.getEast(),
  };
}

export function venueInBoundsPayload(b: MapBoundsPayload, lat: number, lng: number): boolean {
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

export function latLngBoundsLiteralFromVenues(venues: { lat: number; lng: number }[]): LatLngBoundsLiteral | null {
  if (venues.length === 0) return null;
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const v of venues) {
    south = Math.min(south, v.lat);
    north = Math.max(north, v.lat);
    west = Math.min(west, v.lng);
    east = Math.max(east, v.lng);
  }
  if (!Number.isFinite(south) || !Number.isFinite(west)) return null;
  return [
    [south, west],
    [north, east],
  ];
}

/** Default map view when there is no venue data (MicStage home market). */
export const OPEN_MIC_MAP_FALLBACK_CENTER: [number, number] = [41.8781, -87.6298];
export const OPEN_MIC_MAP_FALLBACK_ZOOM = 9;
