/**
 * Extract credible host/organizer identity from open-mic evidence snippets.
 * Does not hallucinate — only returns values with explicit textual evidence.
 */
import { classifyHostOutreachFromEvidence } from "@/lib/growth/hostOutreachSignals";

export type ExtractedHostIdentity = {
  hostBrand: string;
  hostPersonName: string | null;
  evidenceSnippet: string;
  evidenceReason: string;
  sourceUrl: string | null;
};

const HOSTED_BY_RE = /\b(?:hosted by|host:|mc:|presented by|produced by|organized by|organiser:|organizer:)\s+([A-Z][A-Za-z0-9''\-&.\s]{2,60})/i;
const BRAND_MIC_RE = /\b([A-Z][A-Za-z0-9''\-&]{1,40}(?:\s+[A-Z][A-Za-z0-9''\-&]{1,40}){0,3})\s+(?:Open Mic|Comedy Night|Poetry Slam|Songwriter Night|Mic Night)\b/;

export function extractHostIdentityFromEvidence(input: {
  name: string;
  snippet: string | null;
  eventName: string | null;
  sourceUrl: string | null;
}): ExtractedHostIdentity | null {
  const signal = classifyHostOutreachFromEvidence(input);
  if (!signal.isHostCandidate) return null;

  const blob = [input.name, input.eventName, input.snippet].filter(Boolean).join(" ");
  const hosted = blob.match(HOSTED_BY_RE);
  const brand = blob.match(BRAND_MIC_RE);

  const hostPersonName = hosted?.[1]?.trim().replace(/\s+/g, " ").slice(0, 80) || null;
  const hostBrand =
    signal.hostBrandHint?.trim().slice(0, 120) ||
    brand?.[0]?.trim().slice(0, 120) ||
    hostPersonName ||
    input.eventName?.trim().slice(0, 120) ||
    input.name.trim().slice(0, 120);

  if (!hostBrand) return null;

  return {
    hostBrand,
    hostPersonName,
    evidenceSnippet: (input.snippet ?? input.eventName ?? input.name).slice(0, 500),
    evidenceReason: signal.reason,
    sourceUrl: input.sourceUrl,
  };
}
