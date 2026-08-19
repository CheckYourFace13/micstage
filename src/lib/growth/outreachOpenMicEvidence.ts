/**
 * Target-bound open-mic evidence for automated outreach.
 *
 * HIGH email + real venue identity is not enough. Auto-send only when evidence
 * ties an open mic / open jam / performer-signup event to THIS venue.
 *
 * Tiers:
 *   A — official first-party site/calendar/event page
 *   B — official social / high-quality source unambiguously same venue
 *   C — third-party listing (manual review)
 *   D — not evidence (directory snippet, bio, equipment, generic SERP)
 */
import { EVIDENCE_FRESH_DAYS, type StoredEvidenceRow } from "@/lib/publicListings/publicOpenMicEvidenceGate";
import { isNonVenueEvidenceHost } from "@/lib/publicListings/evidenceTrust";
import { extractDiscoverySnippet } from "@/lib/publicListings/openMicEvidence";
import {
  classifyFalseOpenMicSemantics,
  findOpenMicEventMatches,
  isOfficialVenueEventsUrl,
  isTargetBoundOpenMicText,
  stripDiscoveryQueryNoise,
  type FalseOpenMicClass,
} from "@/lib/growth/openMicPhraseSemantics";

export type OutreachEvidenceTier = "A" | "B" | "C" | "D" | "none";

export type OutreachEvidenceRejectClass =
  | "no_target_bound_open_mic_evidence"
  | "stale_open_mic_evidence"
  | "artist_bio_false_positive"
  | "microphone_equipment_false_positive"
  | "open_mike_person_false_positive"
  | "generic_open_copy"
  | "directory_snippet";

export type OutreachOpenMicEvidenceInput = {
  name: string;
  listingName?: string | null;
  websiteUrl?: string | null;
  websiteHostNormalized?: string | null;
  city?: string | null;
  region?: string | null;
  sourceKind?: string | null;
  internalNotes?: string | null;
  discoveryHints?: unknown;
  sourceTitle?: string | null;
  sourceSnippet?: string | null;
  sourceUrl?: string | null;
  listingSourceUrl?: string | null;
  listingWebsiteUrl?: string | null;
  about?: string | null;
  lastVerifiedAt?: Date | null;
  schedules?: Array<{
    title: string | null;
    description: string | null;
    weekday?: string | null;
    isActive?: boolean | null;
  }> | null;
  storedEvidence?: StoredEvidenceRow[] | null;
};

export type OutreachOpenMicEvidenceResult = {
  tier: OutreachEvidenceTier;
  autoSend: boolean;
  rejectClass: OutreachEvidenceRejectClass | null;
  summary: string;
  evidenceUrl: string | null;
  evidenceDate: string | null;
  matchedPhrase: string | null;
  falsePositive: FalseOpenMicClass | null;
};

const HISTORICAL_YEAR_RE = /\b(19\d{2}|200\d|201\d|202[0-3])\b/;
const CURRENT_YEAR_RE = /\b(202[5-9]|203\d)\b/;
const RECURRING_RE =
  /\b(every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekly|bi-?weekly|monthly|recurring|each\s+week)\b/i;
const SOCIAL_HOST_RE = /\b(facebook\.com|fb\.com|instagram\.com|x\.com|twitter\.com)\b/i;

function hostOf(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function venueHost(input: OutreachOpenMicEvidenceInput): string | null {
  return (
    input.websiteHostNormalized?.replace(/^www\./, "").toLowerCase() ||
    hostOf(input.websiteUrl) ||
    hostOf(input.listingWebsiteUrl)
  );
}

function hintStrings(hints: unknown): string[] {
  if (!hints || typeof hints !== "object" || Array.isArray(hints)) return [];
  const h = hints as Record<string, unknown>;
  const keys = ["eventTitle", "eventDescription", "evidenceSnippet", "openMicEvidence", "pageTitle", "sourceTitle"];
  const out: string[] = [];
  for (const k of keys) {
    const v = h[k];
    if (typeof v === "string" && v.trim()) out.push(v);
  }
  return out;
}

function isFirstPartyHost(url: string | null | undefined, vHost: string | null): boolean {
  const h = hostOf(url);
  if (!h || !vHost) return false;
  if (isNonVenueEvidenceHost(h)) return false;
  return h === vHost || h.endsWith(`.${vHost}`) || vHost.endsWith(`.${h}`);
}

function ageDays(d: Date | null | undefined): number | null {
  if (!d) return null;
  return (Date.now() - d.getTime()) / (24 * 60 * 60 * 1000);
}

function staleForAutoSend(text: string, dates: Array<Date | null | undefined>): boolean {
  const best = dates.filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const age = ageDays(best);
  const recurring = RECURRING_RE.test(text);
  const currentYear = CURRENT_YEAR_RE.test(text);
  const historicalYear = HISTORICAL_YEAR_RE.test(text) && !currentYear && !recurring;
  if (historicalYear) return true;
  if (age != null && age > EVIDENCE_FRESH_DAYS && !recurring) return true;
  if (age != null && age > EVIDENCE_FRESH_DAYS * 2) return true;
  return false;
}

function falsePositiveClassFromTexts(texts: string[]): FalseOpenMicClass | null {
  for (const t of texts) {
    const fp = classifyFalseOpenMicSemantics(t);
    if (fp) return fp;
  }
  return null;
}

function rejectFromFalsePositive(fp: FalseOpenMicClass | null): OutreachEvidenceRejectClass {
  if (fp === "artist_bio") return "artist_bio_false_positive";
  if (fp === "microphone_equipment") return "microphone_equipment_false_positive";
  if (fp === "open_mike_person") return "open_mike_person_false_positive";
  if (fp === "generic_open_copy") return "generic_open_copy";
  return "no_target_bound_open_mic_evidence";
}

type Candidate = {
  text: string;
  url: string | null;
  firstParty: boolean;
  social: boolean;
  structured: boolean;
  date: Date | null;
};

function collectCandidates(input: OutreachOpenMicEvidenceInput): Candidate[] {
  const vHost = venueHost(input);
  const out: Candidate[] = [];
  const push = (text: string | null | undefined, url: string | null, extra: Partial<Candidate>) => {
    if (!text?.trim()) return;
    const cleaned = stripDiscoveryQueryNoise(text);
    if (cleaned.length < 8) return;
    out.push({
      text: cleaned,
      url,
      firstParty: extra.firstParty ?? false,
      social: extra.social ?? false,
      structured: extra.structured ?? false,
      date: extra.date ?? null,
    });
  };

  for (const s of input.schedules ?? []) {
    if (s.isActive === false) continue;
    const text = [s.title, s.description].filter(Boolean).join(" — ");
    push(text, input.listingSourceUrl || input.websiteUrl || null, {
      firstParty: true,
      structured: true,
      date: input.lastVerifiedAt ?? null,
    });
  }

  for (const e of input.storedEvidence ?? []) {
    const text = [e.evidenceTitle, e.evidenceExcerpt, e.detectedPhrase].filter(Boolean).join("\n");
    const url =
      typeof (e as { evidenceUrl?: string | null }).evidenceUrl === "string"
        ? (e as { evidenceUrl?: string }).evidenceUrl ?? null
        : null;
    push(text, url, {
      firstParty: Boolean(e.trusted) && !e.reviewOnly,
      structured: Boolean(e.trusted),
      date: e.evidenceDate ?? e.fetchedAt ?? null,
    });
  }

  push(input.sourceTitle, input.sourceUrl || input.listingSourceUrl || null, {
    firstParty: isFirstPartyHost(input.sourceUrl || input.listingSourceUrl, vHost),
    social: SOCIAL_HOST_RE.test(input.sourceUrl || ""),
  });
  for (const h of hintStrings(input.discoveryHints)) {
    push(h, input.sourceUrl || null, {
      firstParty: isFirstPartyHost(input.sourceUrl, vHost),
      structured: true,
    });
  }
  push(input.sourceSnippet, input.sourceUrl || null, {
    firstParty: false,
    structured: false,
  });
  push(extractDiscoverySnippet(input.internalNotes), input.sourceUrl || input.websiteUrl || null, {
    firstParty: false,
    structured: false,
  });
  if (input.internalNotes) {
    push(input.internalNotes, input.websiteUrl || null, { firstParty: false, structured: false });
  }
  push(input.about, input.listingWebsiteUrl || input.websiteUrl || null, {
    firstParty: true,
    structured: false,
  });
  // Lead/listing titles are identity, not first-party event evidence, unless they
  // sit on the venue's own site as a short event heading.
  const nameOnOfficialPage = isOfficialVenueEventsUrl(input.websiteUrl, vHost) || isOfficialVenueEventsUrl(input.sourceUrl, vHost);
  if (nameOnOfficialPage) {
    push(input.name, input.websiteUrl || null, { firstParty: true, structured: false });
    push(input.listingName, input.listingWebsiteUrl || null, { firstParty: true, structured: false });
  }

  return out;
}

function noneResult(
  reject: OutreachEvidenceRejectClass,
  summary: string,
  fp: FalseOpenMicClass | null = null,
): OutreachOpenMicEvidenceResult {
  const dLike =
    reject === "no_target_bound_open_mic_evidence" ||
    reject.endsWith("false_positive") ||
    reject === "generic_open_copy" ||
    reject === "directory_snippet";
  return {
    tier: dLike ? "D" : "none",
    autoSend: false,
    rejectClass: reject,
    summary,
    evidenceUrl: null,
    evidenceDate: null,
    matchedPhrase: null,
    falsePositive: fp,
  };
}

export function classifyOutreachOpenMicEvidence(input: OutreachOpenMicEvidenceInput): OutreachOpenMicEvidenceResult {
  const vHost = venueHost(input);
  const candidates = collectCandidates(input);
  const allText = candidates.map((c) => c.text).join("\n");
  const fpAll = falsePositiveClassFromTexts(candidates.map((c) => c.text));

  const usable = candidates
    .map((c) => {
      const matches = findOpenMicEventMatches(c.text);
      const bound =
        c.structured ||
        c.firstParty ||
        isOfficialVenueEventsUrl(c.url, vHost) ||
        isTargetBoundOpenMicText(c.text, input.name, [input.listingName, input.city]);
      return { c, matches, bound };
    })
    .filter((x) => x.matches.length > 0);

  if (!usable.length) {
    const fp = fpAll || classifyFalseOpenMicSemantics(allText);
    if (fp) {
      return noneResult(rejectFromFalsePositive(fp), `false-positive open-mic semantics (${fp})`, fp);
    }
    if (isNonVenueEvidenceHost(vHost) || isNonVenueEvidenceHost(hostOf(input.sourceUrl))) {
      return noneResult("directory_snippet", "directory/search snippet is not open-mic evidence");
    }
    return noneResult("no_target_bound_open_mic_evidence", "no target-bound open-mic event evidence");
  }

  const dates = [
    ...(input.storedEvidence ?? []).map((e) => e.evidenceDate ?? e.fetchedAt ?? null),
    input.lastVerifiedAt ?? null,
  ];

  const boundUsable = usable.filter((x) => x.bound);
  if (!boundUsable.length) {
    const best = usable[0]!;
    return {
      tier: "C",
      autoSend: false,
      rejectClass: "no_target_bound_open_mic_evidence",
      summary: `open-mic language not bound to ${input.name}`,
      evidenceUrl: best.c.url,
      evidenceDate: best.c.date?.toISOString() ?? null,
      matchedPhrase: best.matches[0]?.phrase ?? null,
      falsePositive: null,
    };
  }

  const firstParty = boundUsable.filter(
    (x) => x.c.firstParty || x.c.structured || isOfficialVenueEventsUrl(x.c.url, vHost),
  );
  const social = boundUsable.filter((x) => x.c.social && x.bound);
  const pick = (firstParty[0] || social[0] || boundUsable[0])!;
  const stale = staleForAutoSend(pick.c.text, [...dates, pick.c.date]);

  if (stale) {
    return {
      tier: "C",
      autoSend: false,
      rejectClass: "stale_open_mic_evidence",
      summary: "open-mic evidence is stale without current recurrence",
      evidenceUrl: pick.c.url,
      evidenceDate: pick.c.date?.toISOString() ?? null,
      matchedPhrase: pick.matches[0]?.phrase ?? null,
      falsePositive: null,
    };
  }

  if (firstParty.length) {
    return {
      tier: "A",
      autoSend: true,
      rejectClass: null,
      summary: pick.c.structured
        ? `first-party structured evidence: ${pick.matches[0]?.phrase}`
        : `official venue page: ${pick.matches[0]?.phrase}`,
      evidenceUrl: pick.c.url,
      evidenceDate: pick.c.date?.toISOString() ?? null,
      matchedPhrase: pick.matches[0]?.phrase ?? null,
      falsePositive: null,
    };
  }

  if (social.length) {
    return {
      tier: "B",
      autoSend: true,
      rejectClass: null,
      summary: `official social/event source: ${pick.matches[0]?.phrase}`,
      evidenceUrl: pick.c.url,
      evidenceDate: pick.c.date?.toISOString() ?? null,
      matchedPhrase: pick.matches[0]?.phrase ?? null,
      falsePositive: null,
    };
  }

  return {
    tier: "C",
    autoSend: false,
    rejectClass: "no_target_bound_open_mic_evidence",
    summary: "third-party open-mic mention — needs official confirmation",
    evidenceUrl: pick.c.url,
    evidenceDate: pick.c.date?.toISOString() ?? null,
    matchedPhrase: pick.matches[0]?.phrase ?? null,
    falsePositive: null,
  };
}
