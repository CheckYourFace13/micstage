/**
 * Short-lived claim-invite session after exchanging a raw URL token.
 * Raw token never enters React props / RSC payloads.
 *
 * Cookie writes must happen in Route Handlers (or Server Actions), not RSC pages.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { OM_CLAIM_INVITE_SESSION_COOKIE_NAME } from "@/lib/authCookieNames";

export const CLAIM_AUTHORITY_CONSENT_VERSION = "2026-08-06-v1";

export const CLAIM_AUTHORITY_AFFIRMATION =
  "I confirm that I am the owner, manager, authorized employee, or authorized host permitted to manage this open mic.";

export type ClaimInviteSession = {
  kind: "claim_invite";
  tokenId: string;
  listingId: string;
  /** Bound recipient — server-side only via HttpOnly cookie. */
  intendedEmailNormalized: string;
};

function getAuthSecret(): string {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "development") {
    return "micstage-dev-only-auth-secret-change-me";
  }
  throw new Error("Missing AUTH_SECRET.");
}

function secretKey() {
  return new TextEncoder().encode(getAuthSecret());
}

function cookieBase(maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  };
}

/** Mask for public UI — never show the full address. */
export function maskClaimInviteEmail(email: string): string {
  const n = email.toLowerCase().trim();
  const at = n.indexOf("@");
  if (at < 1) return "***";
  const local = n.slice(0, at);
  const domain = n.slice(at + 1);
  const domainBit =
    domain.length <= 4 ? "***" : `${domain.slice(0, 2)}***${domain.slice(domain.lastIndexOf("."))}`;
  return `${local.slice(0, 1)}***@${domainBit}`;
}

export async function signClaimInviteSessionJwt(
  session: Omit<ClaimInviteSession, "kind">,
  maxAgeSec = 60 * 60 * 2,
): Promise<string> {
  return new SignJWT({ ...session, kind: "claim_invite" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(secretKey());
}

/** Attach HttpOnly session cookie on a Route Handler redirect response. */
export async function attachClaimInviteSessionCookie(
  res: NextResponse,
  session: Omit<ClaimInviteSession, "kind">,
  maxAgeSec = 60 * 60 * 2,
): Promise<void> {
  const token = await signClaimInviteSessionJwt(session, maxAgeSec);
  res.cookies.set(OM_CLAIM_INVITE_SESSION_COOKIE_NAME, token, cookieBase(maxAgeSec));
}

export function attachClearClaimInviteSessionCookie(res: NextResponse): void {
  res.cookies.set(OM_CLAIM_INVITE_SESSION_COOKIE_NAME, "", cookieBase(0));
}

/**
 * @deprecated Prefer attachClaimInviteSessionCookie on a Route Handler response.
 * Kept for Server Actions / API routes that already use cookies() from next/headers.
 */
export async function setClaimInviteSession(
  session: Omit<ClaimInviteSession, "kind">,
  maxAgeSec = 60 * 60 * 2,
): Promise<void> {
  const token = await signClaimInviteSessionJwt(session, maxAgeSec);
  const jar = await cookies();
  jar.set(OM_CLAIM_INVITE_SESSION_COOKIE_NAME, token, cookieBase(maxAgeSec));
}

export async function clearClaimInviteSession(): Promise<void> {
  const jar = await cookies();
  jar.set(OM_CLAIM_INVITE_SESSION_COOKIE_NAME, "", cookieBase(0));
}

export async function getClaimInviteSession(): Promise<ClaimInviteSession | null> {
  const jar = await cookies();
  const token = jar.get(OM_CLAIM_INVITE_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      payload &&
      typeof payload === "object" &&
      payload.kind === "claim_invite" &&
      typeof payload.tokenId === "string" &&
      typeof payload.listingId === "string" &&
      typeof payload.intendedEmailNormalized === "string"
    ) {
      return {
        kind: "claim_invite",
        tokenId: payload.tokenId,
        listingId: payload.listingId,
        intendedEmailNormalized: payload.intendedEmailNormalized,
      };
    }
    return null;
  } catch {
    return null;
  }
}
