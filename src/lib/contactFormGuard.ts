/**
 * Contact form abuse controls: honeypot, Turnstile, rate limits, duplicate hash,
 * and marketing-solicitation quarantine. Quarantined messages are never emailed
 * to the contact inbox.
 */
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getPrismaOrNull } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rateLimit";

export const CONTACT_QUARANTINE_EVENT_KIND = "contact_form_quarantine";
export const CONTACT_ACCEPTED_EVENT_KIND = "contact_form_accepted";

const MARKETING_SOLICITATION_RE =
  /\b(seo|search\s*engine\s*optim|link[\s-]?building|backlinks?|guest\s*posts?|guest\s*blogging|increase\s+(your\s+)?(traffic|ranking|rankings|visibility)|rank\s+(higher|on\s+google)|google\s+ranking|serp\b|digital\s+marketing\s+(agency|services?|package)|web\s*design\s+(services?|agency|company)|website\s+(redesign|development)\s+(services?|agency)|custom\s+software\s+development|chat\s*bots?\s+(for\s+)?(your\s+)?(website|business)|ai\s+chat\s*bot|whatsapp\s+marketing|cold\s+email\s+(outreach|service)|lead\s+generation\s+service|buy\s+backlinks?|cheap\s+backlinks?|off[\s-]?page\s+seo|on[\s-]?page\s+seo|white[\s-]?hat\s+seo|black[\s-]?hat\s+seo|ppc\s+management|facebook\s+ads?\s+management|grow\s+your\s+(online\s+)?presence|improve\s+your\s+(website|site)\s+traffic|we\s+(can|could)\s+help\s+(you\s+)?(rank|get\s+more\s+traffic)|interested\s+in\s+(our\s+)?(seo|marketing)\s+services?|i\s+noticed\s+your\s+(website|site|business)|dear\s+(sir|madam|owner|webmaster))\b/i;

/** Non-English marketing phrases that are solicitation-shaped (not language-alone blocks). */
const FOREIGN_MARKETING_SOLICITATION_RE =
  /\b(posicionamiento\s+web|mejorar\s+el\s+posicionamiento|aumentar\s+(el\s+)?tr[aá]fico|construir\s+enlaces|linkbuilding|optimisation\s+seo|am[eé]liorer\s+votre\s+r[eé]f[eé]rencement|r[eé]f[eé]rencement\s+naturel|cr[eé]ation\s+de\s+liens|steigern\s+sie\s+ihr\s+ranking|suchmaschinenoptimierung|backlink[\s-]?aufbau|aumentare\s+il\s+traffico|posizionamento\s+seo|aumentar\s+(o\s+)?tr[aá]fego|otimiza[cç][aã]o\s+seo|melhorar\s+seu\s+ranking|网站优化|搜索引擎|外链|ホームページ制作|SEO対策)\b/i;

const LEGITIMATE_TOPIC_RE =
  /\b(open\s*mic|open[\s-]?mike|listing|venue|booking|claim|correct(ion)?|performer|artist|musician|comedy|poetry|signup|sign[\s-]?up|account|login|password|bug|dmca|copyright|schedule|night|stage|micstage)\b/i;

export type ContactGuardInput = {
  name: string;
  email: string;
  category: string;
  details: string;
  /** Honeypot — must be empty for humans. */
  companyWebsite?: string;
  turnstileToken?: string;
};

export type ContactGuardResult =
  | { action: "accept" }
  | { action: "reject"; message: string; fieldErrors?: Record<string, string> }
  | { action: "quarantine"; reason: string };

function normalizeForHash(email: string, details: string): string {
  return `${email.trim().toLowerCase()}|${details.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export function contactDuplicateHash(email: string, details: string): string {
  return createHash("sha256").update(normalizeForHash(email, details)).digest("hex").slice(0, 40);
}

export function detectMarketingSolicitation(input: {
  name: string;
  email: string;
  category: string;
  details: string;
}): { solicitation: boolean; reason: string | null } {
  const hay = `${input.name}\n${input.email}\n${input.details}`;
  const looksLegit = LEGITIMATE_TOPIC_RE.test(hay) || LEGITIMATE_TOPIC_RE.test(input.category);
  const enHit = MARKETING_SOLICITATION_RE.test(hay);
  const fxHit = FOREIGN_MARKETING_SOLICITATION_RE.test(hay);

  // Product-related messages with a single weak SEO word stay open.
  if (looksLegit && input.category !== "partnership" && input.category !== "other") {
    return { solicitation: false, reason: null };
  }

  if (enHit || fxHit) {
    if (enHit && fxHit) return { solicitation: true, reason: "marketing_solicitation_multi" };
    if (enHit) return { solicitation: true, reason: "marketing_solicitation" };
    return { solicitation: true, reason: "marketing_solicitation_localized" };
  }

  return { solicitation: false, reason: null };
}

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return false;
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return Boolean(data.success);
}

async function requesterIp(): Promise<string> {
  try {
    const h = await headers();
    const xfwd = h.get("x-forwarded-for");
    if (!xfwd) return "unknown";
    return xfwd.split(",")[0]?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export async function recordContactAudit(input: {
  kind: typeof CONTACT_QUARANTINE_EVENT_KIND | typeof CONTACT_ACCEPTED_EVENT_KIND;
  reason?: string | null;
  category: string;
  emailHash: string;
  detailsHash: string;
}): Promise<void> {
  const prisma = getPrismaOrNull();
  if (!prisma) return;
  try {
    await prisma.marketingEvent.create({
      data: {
        type: "INTERNAL_AUDIT",
        payload: {
          kind: input.kind,
          reason: input.reason ?? null,
          category: input.category,
          emailHash: input.emailHash,
          detailsHash: input.detailsHash,
          at: new Date().toISOString(),
        },
      },
    });
  } catch (e) {
    console.error("[contact] audit log failed", e instanceof Error ? e.message : e);
  }
}

export async function countContactQuarantinesSince(since: Date): Promise<number> {
  const prisma = getPrismaOrNull();
  if (!prisma) return 0;
  const rows = await prisma.marketingEvent.findMany({
    where: { type: "INTERNAL_AUDIT", createdAt: { gte: since } },
    select: { payload: true },
    take: 2000,
  });
  let n = 0;
  for (const r of rows) {
    const p = r.payload as { kind?: string } | null;
    if (p?.kind === CONTACT_QUARANTINE_EVENT_KIND) n += 1;
  }
  return n;
}

/**
 * Run abuse checks. Quarantine returns a soft success path to the caller
 * (do not email owner). Reject returns a user-visible error.
 */
export async function guardContactSubmission(input: ContactGuardInput): Promise<ContactGuardResult> {
  const honeypot = (input.companyWebsite ?? "").trim();
  if (honeypot) {
    return { action: "quarantine", reason: "honeypot" };
  }

  const ip = await requesterIp();
  const emailKey = input.email.trim().toLowerCase() || "none";

  try {
    const ipLimit = await consumeRateLimit({
      scope: "contact_ip",
      identifier: ip,
      limit: 8,
      windowSec: 60 * 60,
    });
    if (!ipLimit.allowed) {
      return { action: "reject", message: "Too many messages from this network. Please try again later." };
    }

    const emailLimit = await consumeRateLimit({
      scope: "contact_email",
      identifier: emailKey,
      limit: 4,
      windowSec: 60 * 60,
    });
    if (!emailLimit.allowed) {
      return { action: "reject", message: "Too many messages from this email. Please try again later." };
    }
  } catch (e) {
    console.error("[contact] rate limit unavailable", e instanceof Error ? e.message : e);
  }

  const dupHash = contactDuplicateHash(input.email, input.details);
  try {
    const dupLimit = await consumeRateLimit({
      scope: "contact_dup",
      identifier: dupHash,
      limit: 1,
      windowSec: 60 * 60 * 24,
    });
    if (!dupLimit.allowed) {
      return { action: "quarantine", reason: "duplicate_submission" };
    }
  } catch (e) {
    console.error("[contact] duplicate check unavailable", e instanceof Error ? e.message : e);
  }

  if (process.env.TURNSTILE_SECRET_KEY?.trim()) {
    const token = (input.turnstileToken ?? "").trim();
    if (!token) {
      return {
        action: "reject",
        message: "Please complete the security check and try again.",
        fieldErrors: { turnstile: "Security check required." },
      };
    }
    const ok = await verifyTurnstile(token, ip);
    if (!ok) {
      return {
        action: "reject",
        message: "Security check failed. Please refresh and try again.",
        fieldErrors: { turnstile: "Security check failed." },
      };
    }
  }

  const spam = detectMarketingSolicitation({
    name: input.name,
    email: input.email,
    category: input.category,
    details: input.details,
  });
  if (spam.solicitation) {
    return { action: "quarantine", reason: spam.reason ?? "marketing_solicitation" };
  }

  return { action: "accept" };
}
