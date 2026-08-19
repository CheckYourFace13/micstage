/**
 * Classify growth leads that may be host/promoter outreach targets (second autonomous lane).
 * Uses existing evidence gates — does not lower contact-confidence requirements.
 */
export type HostOutreachSignal = {
  isHostCandidate: boolean;
  reason: string;
  hostBrandHint: string | null;
};

const HOST_BRAND_RE = /\b(open mic|comedy night|poetry slam|songwriter|mic night|host(ed by)?|productions?|entertainment)\b/i;

export function classifyHostOutreachFromEvidence(input: {
  name: string;
  snippet: string | null;
  eventName: string | null;
  sourceUrl: string | null;
}): HostOutreachSignal {
  const blob = [input.name, input.eventName, input.snippet, input.sourceUrl].filter(Boolean).join(" ");
  const hostNamed = /\b(hosted by|host:|mc:|presented by|produced by)\s+[A-Z][a-zA-Z]/i.test(blob);
  const brandLike = HOST_BRAND_RE.test(blob) && /\b[A-Z][a-z]+('s)?\s+(open mic|comedy|poetry|mic)\b/.test(blob);
  if (hostNamed || brandLike) {
    return {
      isHostCandidate: true,
      reason: hostNamed ? "named_host_in_evidence" : "host_brand_in_evidence",
      hostBrandHint: input.eventName ?? input.name,
    };
  }
  return { isHostCandidate: false, reason: "not_host_signal", hostBrandHint: null };
}

export const HOST_OUTREACH_CTA_PATH = "/host";

export function hostOutreachPitchLine(): string {
  return "Run every open mic you host from one free account — even across multiple venues.";
}
