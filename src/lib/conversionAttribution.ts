"use client";

/**
 * Session-scoped conversion attribution for GA4 (no raw GrowthLead IDs).
 */
export type ConversionSource = "growth_outreach" | "claim_invite" | "organic" | "unknown";

export type ConversionLandingType = "listing" | "host" | "venue_register" | "claim" | "other";

type StoredAttribution = {
  source: ConversionSource;
  landing_type: ConversionLandingType;
};

const STORAGE_KEY = "ms_conv_attr_v1";
const GROWTH_LEAD_RE = /^c[a-z0-9]{24}$/i;

function readStored(): StoredAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (!parsed?.source || !parsed?.landing_type) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(value: StoredAttribution) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures in strict/privacy contexts.
  }
}

function detectLandingType(pathname: string): ConversionLandingType {
  if (pathname.startsWith("/open-mics/")) return "listing";
  if (pathname === "/host") return "host";
  if (pathname === "/register/venue") return "venue_register";
  if (pathname.startsWith("/claim/")) return "claim";
  return "other";
}

function resolveSource(pathname: string, searchParams: URLSearchParams): ConversionSource {
  if (/^\/claim\/invite\/[^/]+$/.test(pathname)) return "claim_invite";
  const growthLead = searchParams.get("growthLead")?.trim() ?? "";
  if (GROWTH_LEAD_RE.test(growthLead)) return "growth_outreach";
  return "organic";
}

/** Refresh attribution when route or growth params change (preserves stronger prior signals). */
export function refreshConversionAttribution(pathname: string, searchParams: URLSearchParams): void {
  if (typeof window === "undefined") return;

  const incomingSource = resolveSource(pathname, searchParams);
  const landing_type = detectLandingType(pathname);
  const prior = readStored();

  const sourceRank: Record<ConversionSource, number> = {
    unknown: 0,
    organic: 1,
    growth_outreach: 2,
    claim_invite: 2,
  };

  let source = incomingSource;
  if (prior && sourceRank[prior.source] > sourceRank[incomingSource]) {
    source = prior.source;
  } else if (!prior && incomingSource === "organic") {
    source = "organic";
  }

  writeStored({ source, landing_type });
}

export function conversionEventParams(extra?: Record<string, unknown>): Record<string, unknown> {
  const stored = readStored();
  return {
    source: stored?.source ?? "unknown",
    landing_type: stored?.landing_type ?? "other",
    ...extra,
  };
}

export function oncePerSession(key: string, fn: () => void): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(key) === "1") return;
    fn();
    sessionStorage.setItem(key, "1");
  } catch {
    fn();
  }
}
