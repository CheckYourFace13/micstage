import { isValidLineupYmd } from "@/lib/venuePublicLineup";

/** Serializable result from venue portal server actions — client applies navigation (no `redirect()` throw). */
export type VenuePortalActionResult = { redirect: string };

export function portalRedirect(path: string): VenuePortalActionResult {
  return { redirect: path };
}

function optStringFromForm(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/** `/venue?query…` plus optional `lineupDay` from the form (slot row saves). */
export function buildVenuePortalRedirect(query: string, formData: FormData): string {
  const day = optStringFromForm(formData, "lineupDay");
  const suffix = day && isValidLineupYmd(day) ? `&lineupDay=${encodeURIComponent(day)}` : "";
  return `/venue?${query}${suffix}`;
}

/** Thrown from form helpers (e.g. `reqString`) so one `try/catch` per action can convert to a return value. */
export class VenuePortalRedirectSignal extends Error {
  readonly result: VenuePortalActionResult;

  constructor(result: VenuePortalActionResult) {
    super("VENUE_PORTAL_REDIRECT");
    this.name = "VenuePortalRedirectSignal";
    this.result = result;
  }
}

export async function runVenuePortalAction(
  fn: () => Promise<VenuePortalActionResult>,
): Promise<VenuePortalActionResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof VenuePortalRedirectSignal) return e.result;
    throw e;
  }
}
