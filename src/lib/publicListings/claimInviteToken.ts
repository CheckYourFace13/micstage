/**
 * Secure one-time claim invitation tokens.
 * Raw token appears only in email URLs — never log, store, or send to analytics.
 */
import crypto from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

const DEFAULT_TTL_DAYS = 21;

export function hashClaimInviteToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/** Timing-safe compare of equal-length utf8 strings. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function generateRawClaimInviteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function claimInviteTokenTtlDays(): number {
  const n = Number.parseInt(process.env.LISTING_CLAIM_INVITE_TOKEN_TTL_DAYS || "", 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TTL_DAYS;
  return Math.min(90, n);
}

export type IssueClaimInviteTokenResult = {
  /** Raw token for URL only — caller must not persist or log. */
  rawToken: string;
  tokenId: string;
  expiresAt: Date;
};

/**
 * Issues a new ACTIVE token for a listing+email. Revokes prior ACTIVE tokens for the same listing+email.
 */
export async function issueListingClaimInviteToken(
  prisma: PrismaClient,
  input: { listingId: string; intendedEmailNormalized: string; ttlDays?: number },
): Promise<IssueClaimInviteTokenResult> {
  const email = input.intendedEmailNormalized.trim().toLowerCase();
  const rawToken = generateRawClaimInviteToken();
  const tokenHash = hashClaimInviteToken(rawToken);
  const ttl = input.ttlDays ?? claimInviteTokenTtlDays();
  const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000);

  await prisma.listingClaimInviteToken.updateMany({
    where: {
      listingId: input.listingId,
      intendedEmailNormalized: email,
      status: "ACTIVE",
    },
    data: { status: "REVOKED", revokedAt: new Date() },
  });

  const row = await prisma.listingClaimInviteToken.create({
    data: {
      listingId: input.listingId,
      tokenHash,
      intendedEmailNormalized: email,
      expiresAt,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  await prisma.listingClaimAuditEvent.create({
    data: {
      listingId: input.listingId,
      eventType: "CLAIM_INVITE_TOKEN_ISSUED",
      meta: {
        tokenId: row.id,
        emailDomain: email.includes("@") ? email.slice(email.indexOf("@") + 1) : null,
        expiresAt: expiresAt.toISOString(),
      },
    },
  });

  return { rawToken, tokenId: row.id, expiresAt };
}

export type ConsumeClaimInviteTokenResult =
  | {
      ok: true;
      tokenId: string;
      listingId: string;
      intendedEmailNormalized: string;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "expired"
        | "used"
        | "revoked"
        | "wrong_listing"
        | "wrong_recipient";
    };

/**
 * Validates a claim token. Optionally marks USED (one-time).
 * Does not log the raw token.
 */
export async function consumeListingClaimInviteToken(
  prisma: PrismaClient,
  input: {
    rawToken: string;
    listingId?: string;
    loginEmailNormalized?: string;
    markUsed?: boolean;
  },
): Promise<ConsumeClaimInviteTokenResult> {
  const raw = input.rawToken.trim();
  if (!/^[a-f0-9]{64}$/i.test(raw)) {
    return { ok: false, reason: "not_found" };
  }
  const tokenHash = hashClaimInviteToken(raw);
  const row = await prisma.listingClaimInviteToken.findUnique({
    where: { tokenHash },
  });
  if (!row || !timingSafeEqualHex(row.tokenHash, tokenHash)) {
    return { ok: false, reason: "not_found" };
  }

  if (row.status === "USED" || row.usedAt) return { ok: false, reason: "used" };
  if (row.status === "REVOKED" || row.revokedAt) return { ok: false, reason: "revoked" };
  if (row.status === "EXPIRED" || row.expiresAt.getTime() <= Date.now()) {
    if (row.status === "ACTIVE") {
      await prisma.listingClaimInviteToken.update({
        where: { id: row.id },
        data: { status: "EXPIRED" },
      });
    }
    return { ok: false, reason: "expired" };
  }
  if (input.listingId && input.listingId !== row.listingId) {
    return { ok: false, reason: "wrong_listing" };
  }
  if (
    input.loginEmailNormalized &&
    input.loginEmailNormalized.trim().toLowerCase() !== row.intendedEmailNormalized
  ) {
    return { ok: false, reason: "wrong_recipient" };
  }

  if (input.markUsed !== false) {
    const updated = await prisma.listingClaimInviteToken.updateMany({
      where: { id: row.id, status: "ACTIVE", usedAt: null },
      data: { status: "USED", usedAt: new Date() },
    });
    if (updated.count === 0) return { ok: false, reason: "used" };
  }

  return {
    ok: true,
    tokenId: row.id,
    listingId: row.listingId,
    intendedEmailNormalized: row.intendedEmailNormalized,
  };
}

/** Peek without consuming — for rendering the claim page. */
export async function peekListingClaimInviteToken(
  prisma: PrismaClient,
  rawToken: string,
): Promise<ConsumeClaimInviteTokenResult> {
  return consumeListingClaimInviteToken(prisma, {
    rawToken,
    markUsed: false,
  });
}
