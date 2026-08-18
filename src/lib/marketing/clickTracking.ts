import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { appBaseUrl } from "@/lib/marketing/emailConfig";

function clickSecret(): string {
  return (
    process.env.MARKETING_CLICK_SECRET?.trim() ||
    process.env.MARKETING_UNSUBSCRIBE_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "micstage-dev-click-insecure"
  );
}

type ClickPayload = {
  s: string;
  d: string;
  t: number;
};

function signPayload(encoded: string): string {
  return createHmac("sha256", clickSecret()).update(`click:v1:${encoded}`).digest("base64url");
}

const PRODUCTION_CLICK_HOSTS = new Set(["micstage.com", "www.micstage.com"]);

function hostnameIsLoopback(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
}

function tryParseAbsoluteUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

/**
 * Click redirects are first-party only. A valid HMAC is not enough to leave MicStage.
 * Production: https://micstage.com and https://www.micstage.com, plus the configured APP_URL host
 * when it is one of those production hosts.
 * Local/test: http(s) loopback only when NODE_ENV is not production and APP_URL is local.
 */
export function isAllowedMarketingClickDestination(raw: string): boolean {
  const u = tryParseAbsoluteUrl(raw);
  if (!u) return false;
  if (u.username !== "" || u.password !== "") return false;
  if (u.hostname.includes("..")) return false;

  const host = u.hostname.toLowerCase();
  const production = process.env.NODE_ENV === "production";

  if (hostnameIsLoopback(host)) {
    if (production) return false;
    const configured = tryParseAbsoluteUrl(appBaseUrl());
    if (!configured || !hostnameIsLoopback(configured.hostname)) return false;
    return host === configured.hostname.toLowerCase();
  }

  if (u.protocol !== "https:") return false;
  return PRODUCTION_CLICK_HOSTS.has(host);
}

/** Opaque tamper-resistant click token (no PII). */
export function buildMarketingClickToken(sendId: string, destinationUrl: string): string {
  const payload: ClickPayload = { s: sendId, d: destinationUrl, t: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signPayload(encoded)}`;
}

export function verifyMarketingClickToken(token: string): { sendId: string; destinationUrl: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const expected = Buffer.from(signPayload(encoded));
    const got = Buffer.from(sig, "utf8");
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ClickPayload;
    if (!parsed?.s || !parsed?.d || typeof parsed.s !== "string" || typeof parsed.d !== "string") return null;
    if (!isAllowedMarketingClickDestination(parsed.d)) return null;
    return { sendId: parsed.s, destinationUrl: parsed.d };
  } catch {
    return null;
  }
}

export function marketingClickHttpsUrl(sendId: string, destinationUrl: string): string {
  const base = appBaseUrl().replace(/\/$/, "");
  const token = buildMarketingClickToken(sendId, destinationUrl);
  return `${base}/api/marketing/click/${encodeURIComponent(token)}`;
}

/** Wrap destination URL for a draft before send (uses provisional send id after row exists). */
export function wrapOutreachHrefForSend(sendId: string, destinationUrl: string): string {
  return marketingClickHttpsUrl(sendId, destinationUrl);
}

/** Record first unique click; duplicates return existing row without inflating unique counts. */
export async function recordMarketingOutreachClick(
  prisma: PrismaClient,
  input: { sendId: string; destinationUrl: string; contactId?: string | null },
): Promise<{ recorded: boolean; duplicate: boolean }> {
  const existing = await prisma.marketingOutreachClick.findUnique({ where: { sendId: input.sendId } });
  if (existing) return { recorded: false, duplicate: true };

  const send = await prisma.marketingEmailSend.findUnique({
    where: { id: input.sendId },
    select: { id: true, contactId: true, category: true },
  });
  if (!send || send.category !== "OUTREACH") return { recorded: false, duplicate: false };

  try {
    await prisma.marketingOutreachClick.create({
      data: {
        sendId: input.sendId,
        contactId: input.contactId ?? send.contactId ?? undefined,
        destinationUrl: input.destinationUrl.slice(0, 2000),
      },
    });
    await prisma.marketingEvent.create({
      data: {
        type: "EMAIL_CLICKED",
        contactId: input.contactId ?? send.contactId ?? undefined,
        payload: { sendId: input.sendId } as Prisma.InputJsonValue,
      },
    });
    return { recorded: true, duplicate: false };
  } catch {
    return { recorded: false, duplicate: true };
  }
}
