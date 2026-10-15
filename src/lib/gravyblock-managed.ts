/**
 * GravyBlock connector (managed publishing feed). Read-only: fetches a signed feed from
 * GravyBlock, verifies its Ed25519 signature against the public key below, and applies
 * page-level SEO improvements and insight articles. An unsigned, altered or unreachable
 * feed is ignored and the site renders exactly as it would without the connector.
 *
 * See https://gravyblock.com — docs/site-connector-protocol.md for the full generic protocol
 * any compatible site can implement once.
 */
import { createPublicKey, verify } from "node:crypto";
import type { Metadata } from "next";

export const GRAVYBLOCK_BUSINESS_ID = "1461789f-3ab0-4bac-998c-91c75b2b50fa";
const FEED_URL = `https://gravyblock.com/api/managed-site/${GRAVYBLOCK_BUSINESS_ID}/feed`;
const PUBLIC_KEY_B64 = "LCDWzuoPOCXYqSf8s4SOwjeZ4wjJbEnZw37HDA+c320=";
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export type ManagedItem = { slug: string; title: string; description: string | null; bodyHtml: string; coverImageUrl: string | null; publishedAt: string };
export type ManagedOverride = { path: string; title: string | null; description: string | null; ogImage: string | null; jsonLd: Record<string, unknown> | null };
export type ManagedFeed = { version: number; businessId: string; generatedAt: string; items: ManagedItem[]; overrides: ManagedOverride[] };

export async function getManagedFeed(): Promise<ManagedFeed | null> {
  try {
    const res = await fetch(FEED_URL, { next: { revalidate: 60 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const sig = res.headers.get("x-gravyblock-signature");
    const body = await res.text();
    if (!sig) return null;
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(PUBLIC_KEY_B64, "base64")]), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(body, "utf8"), key, Buffer.from(sig, "base64"))) return null;
    const feed = JSON.parse(body) as ManagedFeed;
    return feed.businessId === GRAVYBLOCK_BUSINESS_ID ? feed : null;
  } catch {
    return null;
  }
}

function httpsUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const p = new URL(u);
    return p.protocol === "https:" ? p.toString() : null;
  } catch {
    return null;
  }
}

/** Apply any signed GravyBlock override for this path on top of the page's own metadata object. */
export async function applyManagedMetadata(path: string, base: Metadata): Promise<Metadata> {
  const feed = await getManagedFeed();
  const ov = feed?.overrides.find((o) => o.path === path);
  if (!ov) return base;
  const out: Metadata = { ...base };
  if (ov.title) {
    out.title = { absolute: ov.title };
    out.openGraph = { ...(out.openGraph ?? {}), title: ov.title };
  }
  if (ov.description) {
    out.description = ov.description;
    out.openGraph = { ...(out.openGraph ?? {}), description: ov.description };
  }
  const img = httpsUrl(ov.ogImage);
  if (img) {
    out.openGraph = { ...(out.openGraph ?? {}), images: [{ url: img }] };
    out.twitter = { ...(out.twitter ?? {}), images: [img] };
  }
  return out;
}
