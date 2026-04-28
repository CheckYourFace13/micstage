import "server-only";

/** True when the browser bundle may load Google Places (used by server components only). */
export function hasGoogleMapsBrowserKey(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());
}
