import * as cheerio from "cheerio";

import {
  cleanExtractedName,
  collectJsonLdNodes,
  jsonLdNodeUrl,
  jsonLdTypesOf,
  type JsonLdNode,
} from "@/lib/growth/discovery/venueCandidateExtraction";
import {
  classifyHostName,
  hostNameDuplicatesVenue,
  looksLikePersonHostName,
  normalizeHostBrandKey,
} from "@/lib/growth/hostNameQuality";
import { findOpenMicEventMatches } from "@/lib/growth/openMicPhraseSemantics";
import { isDirectoryHost } from "@/lib/growth/outreachTargetIdentity";

/**
 * Extracts who RUNS the open mic from a crawled page.
 *
 * The page is evidence, never an identity: an event page tells us about a venue AND about the
 * organizer who books it. This module returns only the organizer side, and only when the page
 * actually carries open-mic evidence — the venue lane's identity rules applied to host names.
 */

export type HostOrganizerMethod =
  | "jsonld_event_organizer"
  | "jsonld_event_performer"
  | "text_hosted_by"
  | "text_presents"
  | "branded_series";

export type ExtractedHostOrganizer = {
  name: string;
  /** The organizer's own link when the page revealed one — how enrichment later finds their email. */
  websiteUrl: string | null;
  /** Only ever a structured JSON-LD organizer email; body-text scraping stays in the crawl lane. */
  email: string | null;
  method: HostOrganizerMethod;
  /** 0–100 heuristic strength, used for ordering and hint metadata (never a send gate). */
  confidence: number;
  evidenceSnippet: string;
  sourceUrl: string;
};

export type HostOrganizerRejection = {
  name: string;
  reason: string;
  method: HostOrganizerMethod;
};

export type HostOrganizerExtraction = {
  candidates: ExtractedHostOrganizer[];
  rejected: HostOrganizerRejection[];
  /** False when the page carries no open-mic evidence at all — nothing may be emitted. */
  hasOpenMicEvidence: boolean;
  /** Recurring language ("every Tuesday", "weekly") found on the page, if any. */
  recurrence: string | null;
};

const METHOD_CONFIDENCE: Record<HostOrganizerMethod, number> = {
  jsonld_event_organizer: 85,
  text_hosted_by: 75,
  text_presents: 68,
  branded_series: 62,
  jsonld_event_performer: 55,
};

const METHOD_RANK: Record<HostOrganizerMethod, number> = {
  jsonld_event_organizer: 0,
  text_hosted_by: 1,
  text_presents: 2,
  branded_series: 3,
  jsonld_event_performer: 4,
};

/** JSON-LD types that can name an organizer. An untyped node is allowed (many pages omit it). */
const ORG_TYPES = new Set([
  "organization",
  "person",
  "performinggroup",
  "musicgroup",
  "theatergroup",
  "localbusiness",
  "entertainmentbusiness",
  "eventorganizer",
  "corporation",
  "ngo",
]);

/**
 * Name tokens stay case-sensitive on purpose: a case-insensitive class would swallow the running
 * sentence after the host phrase ("hosted by Marvin Productions every Tuesday at ...").
 */
const NAME_CORE = "[A-Z][A-Za-z0-9'\u2019&.\\-]*";
const LEADING_ARTICLE = "(?:[Tt]he\\s+|[Oo]ur\\s+|[Yy]our\\s+)?";

const HOST_PREFIX =
  "(?:[Hh]osted\\s+[Bb]y|[Cc]o-?[Hh]osted\\s+[Bb]y|[Ww]ith\\s+[Yy]our\\s+[Hh]osts?|[Yy]our\\s+[Hh]osts?(?:\\s+(?:is|are))?|[Hh]osts?\\s*:|[Pp]resented\\s+[Bb]y|[Pp]roduced\\s+[Bb]y|[Bb]rought\\s+to\\s+you\\s+[Bb]y|[Oo]rganized\\s+[Bb]y|[Oo]rganised\\s+[Bb]y|[Cc]urated\\s+[Bb]y|MC\\s*:|[Ee]mcee\\s*:|MC'?d\\s+[Bb]y)";

/** "hosted by X", "your host X", "presented by X", "produced by X", "MC: X". */
const HOSTED_BY_RE = new RegExp(
  `\\b${HOST_PREFIX}\\s*${LEADING_ARTICLE}(${NAME_CORE}(?:\\s+${NAME_CORE}){0,4})`,
  "g",
);

/** "X presents", "an X production". */
const PRESENTS_RE = new RegExp(`\\b(${NAME_CORE}(?:\\s+${NAME_CORE}){0,4})\\s+[Pp]resents\\b`, "g");
const PRODUCTION_RE = new RegExp(
  `\\b[Aa]n?\\s+${LEADING_ARTICLE}(${NAME_CORE}(?:\\s+${NAME_CORE}){0,3})\\s+[Pp]roduction\\b`,
  "g",
);

/** "Lincoln Square Open Mic" — a branded recurring series whose brand is not the venue. */
const BRANDED_SERIES_RE = new RegExp(
  `\\b(${NAME_CORE}(?:\\s+${NAME_CORE}){0,3}\\s+(?:Comedy\\s+Open\\s+Mic|Poetry\\s+Open\\s+Mic|Open\\s+Mic(?:\\s+Night)?|Mic\\s+Night|Open\\s+Stage|Open\\s+Jam))\\b`,
);

const RECURRING_RE =
  /\b(every\s+(?:other\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?|weekly|bi-?weekly|monthly|every\s+week|each\s+week|first\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+of|recurring)\b/i;

const ASSET_PATH_RE = /\.(png|jpe?g|gif|webp|svg|pdf|mp4|mp3|zip|css|js)(\?|$)/i;

/** Anchor text that names an action, not an organizer. */
const ACTION_ANCHOR_RE =
  /\b(read|more|here|click|website|ticket|tickets|info|details|directions|map|menu|home|login|signup|subscribe|share|donate|next|previous|back)\b/i;

const SNIPPET_RADIUS = 220;

/** How far a host phrase may sit from open-mic evidence and still be about that mic. */
const OPEN_MIC_PROXIMITY_CHARS = 700;

type AnchorInfo = {
  key: string;
  href: string | null;
  context: string;
};

function hostOf(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname
      .replace(/^www\./i, "")
      .toLowerCase();
  } catch {
    return null;
  }
}

function compactKey(name: string | null | undefined): string {
  return normalizeHostBrandKey(name).replace(/\s+/g, "");
}

function firstEmailField(node: JsonLdNode): string | null {
  const raw = node.email;
  const value =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw.find((x) => typeof x === "string") : null;
  if (typeof value !== "string") return null;
  const match = value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match?.[0]?.toLowerCase() ?? null;
}

function eventLocationNames(nodes: JsonLdNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (!jsonLdTypesOf(node).some((t) => t.includes("event"))) continue;
    const loc = node.location;
    if (loc && typeof loc === "object" && typeof (loc as JsonLdNode).name === "string") {
      out.push(cleanExtractedName((loc as JsonLdNode).name as string));
    }
  }
  return out.filter(Boolean);
}

function collectAnchors($: cheerio.CheerioAPI, pageUrl: string): AnchorInfo[] {
  const out: AnchorInfo[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    const text = cleanExtractedName($(el).text());
    if (!text) return;
    let abs: string | null = null;
    if (href && !href.startsWith("#") && !href.toLowerCase().startsWith("mailto:")) {
      try {
        const u = new URL(href, pageUrl);
        if (/^https?:$/i.test(u.protocol) && !ASSET_PATH_RE.test(u.pathname)) {
          abs = u.toString().split("#")[0]!;
        }
      } catch {
        abs = null;
      }
    }
    out.push({
      key: compactKey(text),
      href: abs,
      context: cleanExtractedName($(el).parent().text()).slice(0, 600),
    });
  });
  return out;
}

/**
 * The organizer's link: an anchor wrapping the name, or an anchor in the same block as the host
 * phrase. That link is the only way enrichment can later mine a domain-matching mailbox.
 */
function linkForName(anchors: AnchorInfo[], name: string, phrase: string): string | null {
  const key = compactKey(name);
  if (!key) return null;
  const exact = anchors.find((a) => a.href && a.key === key);
  if (exact?.href) return exact.href;
  const contained = anchors.find(
    (a) => a.href && a.key.length >= 6 && (key.includes(a.key) || a.key.includes(key)),
  );
  if (contained?.href) return contained.href;
  const nearby = anchors.find(
    (a) =>
      a.href &&
      a.key.length >= 4 &&
      !ACTION_ANCHOR_RE.test(a.key) &&
      a.context.toLowerCase().includes(phrase.toLowerCase()),
  );
  return nearby?.href ?? null;
}

/**
 * A capitalized-token run can walk past the end of a sentence ("hosted by Laugh Circuit. All
 * performers welcome"), so the name stops at the first real sentence terminator. Short tokens keep
 * their dot so initials and abbreviations ("J. Smith", "St. Marks Collective") survive.
 */
function trimAtSentenceBoundary(raw: string): string {
  const out: string[] = [];
  for (const word of raw.split(/\s+/).filter(Boolean)) {
    out.push(word);
    if (/[.!?]$/.test(word) && word.replace(/[.!?]+$/, "").length > 2) break;
  }
  return out.join(" ").replace(/[.,;:!?]+$/, "");
}

function snippetAround(text: string, index: number): string {
  const start = Math.max(0, index - 60);
  return text.slice(start, start + SNIPPET_RADIUS).trim();
}

/**
 * Pull host/organizer identities from a crawled page.
 *
 * Emits nothing when the page has no open-mic evidence, and rejects venue duplicates, publisher /
 * directory brands, generic labels, bare social handles, and uncorroborated personal names.
 */
export function extractHostOrganizersFromPage(input: {
  pageUrl: string;
  html: string;
  /** The venue this page is about, when known: a host brand must be distinct from it. */
  venueName?: string | null;
  maxCandidates?: number;
}): HostOrganizerExtraction {
  const { pageUrl, html } = input;
  const maxCandidates = input.maxCandidates ?? 6;
  const rejected: HostOrganizerRejection[] = [];
  const accepted: ExtractedHostOrganizer[] = [];

  const $ = cheerio.load(html);
  const nodes = collectJsonLdNodes($);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 40_000);
  const structuredNames = nodes
    .map((n) => (typeof n.name === "string" ? n.name : ""))
    .filter(Boolean)
    .join(" ");
  const evidenceText = `${$("title").first().text()} ${structuredNames} ${bodyText}`
    .replace(/\s+/g, " ")
    .trim();
  const pageEvidence = findOpenMicEventMatches(evidenceText);
  const recurrence = RECURRING_RE.exec(evidenceText)?.[0] ?? null;

  if (pageEvidence.length === 0) {
    return { candidates: [], rejected, hasOpenMicEvidence: false, recurrence };
  }

  /** Proximity is measured in body text only, so indices always share one coordinate space. */
  const bodyEvidenceIndices = findOpenMicEventMatches(bodyText).map((m) => m.index);
  /**
   * Page-level evidence is already proven above; when the qualifying phrase lived in the title or
   * JSON-LD rather than the prose, anchor proximity on the body's literal mentions instead. This
   * only decides "is the host phrase about this mic" — it is not an evidence test.
   */
  if (bodyEvidenceIndices.length === 0) {
    const mentionRe = /open[\s-]?mics?/gi;
    let mention: RegExpExecArray | null;
    let guard = 0;
    while ((mention = mentionRe.exec(bodyText)) && guard++ < 40) {
      bodyEvidenceIndices.push(mention.index);
    }
  }

  const pageHost = hostOf(pageUrl);
  const siteName = cleanExtractedName($('meta[property="og:site_name"]').attr("content") ?? "");
  const publisherKeys = new Set(
    [siteName, pageHost?.replace(/\.[a-z.]+$/, "") ?? ""].map((s) => compactKey(s)).filter((s) => s.length >= 4),
  );
  const venueKeys = [input.venueName ?? "", ...eventLocationNames(nodes)].filter(Boolean);
  const anchors = collectAnchors($, pageUrl);

  const reject = (name: string, method: HostOrganizerMethod, reason: string) => {
    rejected.push({ name: name.slice(0, 120), method, reason });
  };

  /**
   * Central gate. Every method funnels through it, so a new extraction path can never bypass the
   * name rules that keep article titles, publishers and nav labels out of the lead table.
   */
  const consider = (raw: {
    name: string;
    method: HostOrganizerMethod;
    websiteUrl: string | null;
    email: string | null;
    evidenceSnippet: string;
    /** True when the page explicitly says this entity hosts/presents/produces the mic. */
    hostPhraseCorroborated: boolean;
  }): void => {
    const name = cleanExtractedName(raw.name);
    if (!name) return;

    const nameReject = classifyHostName(name);
    if (nameReject) {
      reject(name, raw.method, `host_name_${nameReject.toLowerCase()}`);
      return;
    }
    const key = compactKey(name);
    if ([...publisherKeys].some((p) => key === p || key.includes(p) || p.includes(key))) {
      reject(name, raw.method, "publisher_self");
      return;
    }
    if (venueKeys.some((v) => hostNameDuplicatesVenue(name, v))) {
      reject(name, raw.method, "duplicates_venue_identity");
      return;
    }
    if (looksLikePersonHostName(name) && !raw.hostPhraseCorroborated) {
      reject(name, raw.method, "person_name_without_host_evidence");
      return;
    }

    accepted.push({
      name: name.slice(0, 120),
      // A directory link is evidence about the host, never the host's own site.
      websiteUrl: isDirectoryHost(hostOf(raw.websiteUrl)) ? null : raw.websiteUrl,
      email: raw.email,
      method: raw.method,
      confidence: METHOD_CONFIDENCE[raw.method],
      evidenceSnippet: raw.evidenceSnippet.slice(0, 400),
      sourceUrl: pageUrl,
    });
  };

  // ---- JSON-LD Event.organizer / Event.performer ---------------------------------------------
  for (const node of nodes) {
    if (!jsonLdTypesOf(node).some((t) => t.includes("event"))) continue;
    const eventName = typeof node.name === "string" ? cleanExtractedName(node.name) : "";

    for (const field of ["organizer", "performer"] as const) {
      const rawField = node[field];
      const list = Array.isArray(rawField) ? rawField : rawField ? [rawField] : [];
      const method: HostOrganizerMethod =
        field === "organizer" ? "jsonld_event_organizer" : "jsonld_event_performer";
      for (const entry of list) {
        if (typeof entry === "string") {
          consider({
            name: entry,
            method,
            websiteUrl: null,
            email: null,
            evidenceSnippet: eventName || pageEvidence[0]!.window,
            hostPhraseCorroborated: field === "organizer",
          });
          continue;
        }
        if (!entry || typeof entry !== "object") continue;
        const obj = entry as JsonLdNode;
        const entryTypes = jsonLdTypesOf(obj);
        if (entryTypes.length > 0 && !entryTypes.some((t) => ORG_TYPES.has(t))) continue;
        if (typeof obj.name !== "string" || !obj.name.trim()) continue;
        consider({
          name: obj.name,
          method,
          websiteUrl: jsonLdNodeUrl(obj),
          email: firstEmailField(obj),
          evidenceSnippet: eventName || pageEvidence[0]!.window,
          hostPhraseCorroborated: field === "organizer",
        });
      }
    }
  }

  // ---- Text patterns near open-mic evidence --------------------------------------------------
  const runTextPattern = (re: RegExp, method: HostOrganizerMethod): void => {
    const clone = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = clone.exec(bodyText)) && guard++ < 40) {
      const name = trimAtSentenceBoundary(m[1] ?? "");
      if (!name.trim()) continue;
      if (!bodyEvidenceIndices.some((i) => Math.abs(i - m!.index) <= OPEN_MIC_PROXIMITY_CHARS)) {
        reject(name, method, "host_phrase_not_near_open_mic_evidence");
        continue;
      }
      consider({
        name,
        method,
        websiteUrl: linkForName(anchors, name, m[0]),
        email: null,
        evidenceSnippet: snippetAround(bodyText, m.index),
        hostPhraseCorroborated: true,
      });
    }
  };

  runTextPattern(HOSTED_BY_RE, "text_hosted_by");
  runTextPattern(PRESENTS_RE, "text_presents");
  runTextPattern(PRODUCTION_RE, "text_presents");

  // ---- Recurring branded series --------------------------------------------------------------
  if (recurrence) {
    const seriesSources = [
      ...nodes
        .filter((n) => jsonLdTypesOf(n).some((t) => t.includes("event")))
        .map((n) => (typeof n.name === "string" ? n.name : "")),
      $("h1").first().text(),
      ...$("h2, h3")
        .map((_, el) => $(el).text())
        .get()
        .slice(0, 12),
    ];
    for (const raw of seriesSources) {
      const text = cleanExtractedName(raw);
      if (!text) continue;
      const seriesName = cleanExtractedName(BRANDED_SERIES_RE.exec(text)?.[1] ?? "");
      if (!seriesName) continue;
      consider({
        name: seriesName,
        method: "branded_series",
        websiteUrl: linkForName(anchors, seriesName, seriesName),
        email: null,
        evidenceSnippet: `${text} — ${recurrence}`,
        hostPhraseCorroborated: false,
      });
    }
  }

  // ---- Dedupe: keep the strongest method per identity, merge its link/email ------------------
  const best = new Map<string, ExtractedHostOrganizer>();
  for (const cand of accepted) {
    const key = compactKey(cand.name);
    if (!key) continue;
    const prev = best.get(key);
    if (!prev) {
      best.set(key, cand);
      continue;
    }
    const winner = METHOD_RANK[cand.method] < METHOD_RANK[prev.method] ? { ...cand } : { ...prev };
    winner.websiteUrl = winner.websiteUrl ?? prev.websiteUrl ?? cand.websiteUrl;
    winner.email = winner.email ?? prev.email ?? cand.email;
    winner.confidence = Math.max(prev.confidence, cand.confidence);
    best.set(key, winner);
  }

  const candidates = [...best.values()].sort((a, b) => b.confidence - a.confidence).slice(0, maxCandidates);
  return { candidates, rejected, hasOpenMicEvidence: true, recurrence };
}
