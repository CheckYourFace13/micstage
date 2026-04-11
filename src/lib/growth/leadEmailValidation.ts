import type { GrowthLeadEmailConfidence } from "@/generated/prisma/client";

export type ParsedGrowthLeadEmail =
  | {
      kind: "valid";
      /** Lowercase normalized mailbox suitable for DB + dedupe */
      normalized: string;
      confidence: GrowthLeadEmailConfidence;
      rawExtracted: string;
    }
  | { kind: "rejected"; rawExtracted: string; rejectionReason: string }
  | { kind: "empty" };

const RESERVED_TLDS = new Set([
  "test",
  "invalid",
  "localhost",
  "example",
  "local",
  "onion",
  "internal",
]);

/** Multi-label generics and common ccTLD-style tokens we accept when length > 4. */
const KNOWN_TLD = new Set([
  "com",
  "net",
  "org",
  "edu",
  "gov",
  "mil",
  "int",
  "info",
  "biz",
  "name",
  "pro",
  "app",
  "dev",
  "io",
  "co",
  "me",
  "tv",
  "cc",
  "ws",
  "ai",
  "fm",
  "ms",
  "gd",
  "to",
  "uk",
  "us",
  "ca",
  "au",
  "de",
  "fr",
  "it",
  "es",
  "nl",
  "be",
  "ch",
  "at",
  "se",
  "no",
  "dk",
  "fi",
  "pl",
  "ie",
  "nz",
  "jp",
  "cn",
  "in",
  "br",
  "mx",
  "ar",
  "mobi",
  "asia",
  "jobs",
  "guru",
  "club",
  "live",
  "news",
  "tech",
  "blog",
  "shop",
  "store",
  "email",
  "cloud",
  "site",
  "online",
  "world",
  "today",
  "agency",
  "studio",
  "design",
  "support",
  "help",
  "art",
  "xyz",
  "link",
  "page",
  "group",
  "team",
  "work",
  "ltd",
  "inc",
  "llc",
  "biz",
  "marketing",
  "digital",
  "media",
  "events",
  "venue",
  "music",
  "band",
  "show",
  "museum",
  "travel",
  "photos",
  "social",
  "network",
  "solutions",
  "services",
  "company",
  "global",
  "nyc",
  "la",
]);

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "yopmail.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "throwaway.email",
  "trashmail.com",
]);

const PLACEHOLDER_DOMAINS = new Set(["example.com", "example.org", "example.net", "test.com", "domain.com", "localhost"]);

const LABEL_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/i;

function stripWrappers(s: string): string {
  return s.replace(/^[<\s"'([{]+|[>\s"')\]}.,;:!]+$/g, "").trim();
}

function stripMailto(s: string): string {
  let t = s.trim();
  if (/^mailto:/i.test(t)) {
    t = t.slice(7).trim();
    const q = t.indexOf("?");
    if (q >= 0) t = t.slice(0, q).trim();
    try {
      t = decodeURIComponent(t.replace(/\+/g, " "));
    } catch {
      /* keep */
    }
  }
  return t;
}

/**
 * Pull a single address token from noisy scraped text.
 */
export function extractEmailCandidateFromRaw(rawInput: string): { candidate: string; extractedFromNoisyText: boolean } {
  const base = stripWrappers(stripMailto(rawInput.trim()));
  if (!base) return { candidate: "", extractedFromNoisyText: false };

  const atCount = (base.match(/@/g) ?? []).length;
  if (atCount === 1 && !/\s/.test(base)) {
    return { candidate: base, extractedFromNoisyText: false };
  }

  if (atCount > 1) {
    const tokens = base.split(/\s+/);
    for (const tok of tokens) {
      const t = stripWrappers(tok);
      if ((t.match(/@/g) ?? []).length === 1) {
        return { candidate: t, extractedFromNoisyText: true };
      }
    }
  }

  const m = base.match(/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+/);
  if (m) {
    return { candidate: stripWrappers(m[0]), extractedFromNoisyText: true };
  }

  return { candidate: base, extractedFromNoisyText: atCount > 0 || /\s/.test(base) };
}

function localPartPhoneGlued(local: string): boolean {
  if (/^\d{6,}/.test(local)) return true;
  if (/^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}[a-zA-Z]/i.test(local)) return true;
  if (/^\d[\d.()\-\s]{10,}/.test(local)) return true;
  return false;
}

function strictLocalPart(local: string): string | null {
  if (!local || local.length > 64) return null;
  if (/\s/.test(local)) return null;
  if (local.startsWith(".") || local.endsWith(".")) return null;
  if (local.includes("..")) return null;
  if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  return local;
}

function strictDomain(domain: string): string | null {
  const d = domain.trim().toLowerCase();
  if (!d || d.length > 253) return null;
  if (d.startsWith(".") || d.endsWith(".") || d.includes("..")) return null;
  const labels = d.split(".");
  if (labels.length < 2) return null;
  for (const lab of labels) {
    if (lab.length < 1 || lab.length > 63) return null;
    if (!LABEL_RE.test(lab)) return null;
  }
  return d;
}

function tldAllowed(tld: string): boolean {
  const t = tld.toLowerCase();
  if (!/^[a-z]+$/.test(t) || t.length < 2 || t.length > 63) return false;
  if (RESERVED_TLDS.has(t)) return false;
  if (t.length === 2) return true;
  return KNOWN_TLD.has(t);
}

function isPlaceholderMailbox(normalizedLower: string, allowPlaceholder: boolean): boolean {
  if (allowPlaceholder) return false;
  const [loc, dom] = normalizedLower.split("@");
  if (!loc || !dom) return true;
  if (PLACEHOLDER_DOMAINS.has(dom)) return true;
  if (dom.endsWith(".example.com") || dom.endsWith(".test")) return true;
  if (normalizedLower === "email@example.com") return true;
  if (normalizedLower === "user@domain.com") return true;
  if (/^test\d*@test\.com$/i.test(normalizedLower)) return true;
  if (/^noreply@|^no-reply@|^donotreply@|^do-not-reply@|^mailer-daemon@|^postmaster@/i.test(normalizedLower)) return true;
  if (/^(fake|test|testing|demo|sample|spam|junk|invalid|dummy)@/i.test(normalizedLower)) return true;
  if (loc === "email" && dom.includes("example")) return true;
  if (loc === "user" && (dom === "domain.com" || dom.includes("example"))) return true;
  return false;
}

function confidenceFor(
  extractedFromNoisyText: boolean,
  normalized: string,
  allowPlaceholder: boolean,
): GrowthLeadEmailConfidence {
  const [loc, dom] = normalized.split("@");
  if (DISPOSABLE_DOMAINS.has(dom)) return "LOW";
  const digitRatio = loc.length ? (loc.match(/\d/g) ?? []).length / loc.length : 0;
  if (digitRatio >= 0.45 && loc.length > 4) return "LOW";
  if (loc.length <= 2 && !/^[a-z]{1,2}$/i.test(loc)) return "LOW";
  if (extractedFromNoisyText) return "MEDIUM";
  if (allowPlaceholder) return "MEDIUM";
  return "HIGH";
}

export type ParseGrowthLeadEmailOptions = {
  /** Manual admin only: allow example.com-style placeholders through validation (still strict shape). */
  allowPlaceholderEmail?: boolean;
  /** Discovery adapters set true when the string came from page text / SERP, not a dedicated email field. */
  extractedFromNoisyText?: boolean;
};

/**
 * Validates and classifies a single growth-lead email candidate before DB save or send.
 */
export function parseGrowthLeadEmailInput(
  rawInput: string | null | undefined,
  opts?: ParseGrowthLeadEmailOptions,
): ParsedGrowthLeadEmail {
  if (rawInput == null || !String(rawInput).trim()) {
    return { kind: "empty" };
  }

  const rawOriginal = String(rawInput);
  const { candidate, extractedFromNoisyText } = extractEmailCandidateFromRaw(rawOriginal);
  const noisy = Boolean(opts?.extractedFromNoisyText || extractedFromNoisyText);

  if (!candidate) {
    return { kind: "rejected", rawExtracted: rawOriginal.trim(), rejectionReason: "empty_after_normalize" };
  }

  const atParts = candidate.split("@");
  if (atParts.length !== 2) {
    return { kind: "rejected", rawExtracted: rawOriginal.trim(), rejectionReason: "malformed_multi_at" };
  }

  let [localRaw, domainRaw] = atParts;
  localRaw = localRaw.trim();
  domainRaw = domainRaw.trim();

  const local = strictLocalPart(localRaw);
  const domain = strictDomain(domainRaw);
  if (!local || !domain) {
    return { kind: "rejected", rawExtracted: rawOriginal.trim(), rejectionReason: "invalid_local_or_domain" };
  }

  if (localPartPhoneGlued(local)) {
    return { kind: "rejected", rawExtracted: rawOriginal.trim(), rejectionReason: "phone_merged_into_local_part" };
  }

  const labels = domain.split(".");
  const tld = labels[labels.length - 1]!;
  if (!tldAllowed(tld)) {
    return { kind: "rejected", rawExtracted: rawOriginal.trim(), rejectionReason: "invalid_or_suspicious_tld" };
  }

  const normalized = `${local.toLowerCase()}@${domain}`;
  if (isPlaceholderMailbox(normalized, Boolean(opts?.allowPlaceholderEmail))) {
    return { kind: "rejected", rawExtracted: rawOriginal.trim(), rejectionReason: "placeholder_or_test_email" };
  }

  const confidence = confidenceFor(noisy, normalized, Boolean(opts?.allowPlaceholderEmail));

  return {
    kind: "valid",
    normalized,
    confidence,
    rawExtracted: rawOriginal.trim(),
  };
}

/** MarketingContact / sidecar: only store addresses we would mail on automation paths. */
export function growthLeadEmailOkForMarketingSidecar(parsed: ParsedGrowthLeadEmail): parsed is Extract<
  ParsedGrowthLeadEmail,
  { kind: "valid" }
> {
  return parsed.kind === "valid" && (parsed.confidence === "HIGH" || parsed.confidence === "MEDIUM");
}

export function growthLeadEmailEligibleForAutoOutreach(parsed: ParsedGrowthLeadEmail): boolean {
  return parsed.kind === "valid" && (parsed.confidence === "HIGH" || parsed.confidence === "MEDIUM");
}

/**
 * Venue outreach automation: canonical mailbox for drafts/sends (strict parse + HIGH/MEDIUM only).
 * Avoids `normalizeMarketingEmail`-only paths that let malformed addresses reach Resend.
 */
export function venueLeadMailboxForOutreach(
  raw: string | null | undefined,
  contactEmailConfidence: GrowthLeadEmailConfidence | null | undefined,
):
  | { ok: true; normalized: string }
  | { ok: false; reason: string } {
  const noisy = contactEmailConfidence !== "HIGH";
  const parsed = parseGrowthLeadEmailInput(raw ?? "", { extractedFromNoisyText: noisy });
  if (parsed.kind === "valid" && growthLeadEmailEligibleForAutoOutreach(parsed)) {
    return { ok: true, normalized: parsed.normalized };
  }
  if (parsed.kind === "rejected") return { ok: false, reason: parsed.rejectionReason };
  if (parsed.kind === "empty") return { ok: false, reason: "empty" };
  return { ok: false, reason: "low_confidence_or_ineligible" };
}
