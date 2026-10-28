import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { CLAIM_AUTHORITY_ROLES, type ClaimAuthorityRole } from "@/lib/publicListings/claimAutoApproval";
import { submitInstantClaim } from "@/lib/publicListings/instantClaimActivation";
import {
  CLAIM_FUNNEL_EVENT,
  claimFailureFunnelEvent,
  recordClaimFunnelEvent,
} from "@/lib/publicListings/claimFunnelEvents";
import {
  clearClaimInviteSession,
  getClaimInviteSession,
} from "@/lib/publicListings/claimInviteSession";
import { siteOrigin } from "@/lib/publicSeo";
import { consumeRateLimit } from "@/lib/rateLimit";
import { setSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    const site = request.headers.get("sec-fetch-site");
    if (!site || site === "same-origin" || site === "same-site" || site === "none") return true;
    return false;
  }
  try {
    const allowed = new URL(siteOrigin()).origin;
    return new URL(origin).origin === allowed;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "Unavailable" }, { status: 503 });
  }
  const db = prisma;

  if (!originAllowed(request)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const claimSession = await getClaimInviteSession();
  const listingSlug = typeof body.listingSlug === "string" ? body.listingSlug : "";
  const contactName = typeof body.contactName === "string" ? body.contactName : "";
  const role = typeof body.role === "string" ? body.role : "";
  const authorityConfirmed = body.authorityConfirmed === true;
  const termsAccepted = body.termsAccepted === true;
  const privacyAccepted = body.privacyAccepted === true;
  const loginEmail = claimSession?.intendedEmailNormalized ?? "";

  if (!listingSlug) {
    return NextResponse.json({ ok: false, error: "Missing listing" }, { status: 400 });
  }

  const listingForAudit = await db.publicOpenMicListing.findUnique({
    where: { slug: listingSlug.trim() },
    select: { id: true, slug: true, growthLeadId: true },
  });

  async function recordFail(eventType: Parameters<typeof recordClaimFunnelEvent>[1]["eventType"], reason: string) {
    if (!listingForAudit) return;
    await recordClaimFunnelEvent(db, {
      listingId: listingForAudit.id,
      eventType,
      meta: {
        listingSlug: listingForAudit.slug,
        tokenId: claimSession?.tokenId,
        growthLeadId: listingForAudit.growthLeadId,
        reason,
      },
    });
  }

  if (!claimSession) {
    await recordFail(CLAIM_FUNNEL_EVENT.FAILED_SESSION, "no_session");
    return NextResponse.json({ ok: false, error: "Invitation session expired" }, { status: 400 });
  }
  if (!CLAIM_AUTHORITY_ROLES.includes(role as ClaimAuthorityRole)) {
    await recordFail(CLAIM_FUNNEL_EVENT.FAILED_VALIDATION, "invalid_role");
    return NextResponse.json({ ok: false, error: "Invalid role" }, { status: 400 });
  }
  if (!authorityConfirmed || !termsAccepted || !privacyAccepted) {
    await recordFail(CLAIM_FUNNEL_EVENT.FAILED_VALIDATION, "consent_required");
    return NextResponse.json({ ok: false, error: "Consent required" }, { status: 400 });
  }

  const emailKey = loginEmail.trim().toLowerCase() || "unknown";
  if (listingForAudit) {
    await db.listingClaimAuditEvent.create({
      data: {
        listingId: listingForAudit.id,
        eventType: "CLAIM_SUBMIT_ATTEMPT",
        meta: {
          listingSlug: listingSlug.trim().slice(0, 120),
          hasSession: true,
          emailDomain: emailKey.includes("@") ? emailKey.slice(emailKey.indexOf("@") + 1) : null,
        },
      },
    });
    await recordClaimFunnelEvent(db, {
      listingId: listingForAudit.id,
      eventType: CLAIM_FUNNEL_EVENT.FORM_SUBMITTED,
      meta: {
        listingSlug: listingForAudit.slug,
        tokenId: claimSession.tokenId,
        growthLeadId: listingForAudit.growthLeadId,
      },
    });
  }

  const rlEmail = await consumeRateLimit({
    scope: "claim:instant:email",
    identifier: emailKey,
    limit: 8,
    windowSec: 60 * 15,
  });
  const rlSlug = await consumeRateLimit({
    scope: "claim:instant:slug",
    identifier: listingSlug.trim().toLowerCase(),
    limit: 20,
    windowSec: 60 * 15,
  });
  if (!rlEmail.allowed || !rlSlug.allowed) {
    console.warn("[api/claim/instant] rate_limited", {
      slug: listingSlug.slice(0, 80),
      emailDomain: emailKey.includes("@") ? emailKey.slice(emailKey.indexOf("@") + 1) : null,
    });
    await recordFail(CLAIM_FUNNEL_EVENT.FAILED_OTHER, "rate_limited");
    return NextResponse.json({ ok: false, error: "Too many attempts" }, { status: 429 });
  }

  try {
    const result = await submitInstantClaim(db, {
      tokenId: claimSession.tokenId,
      listingSlug,
      contactName,
      role: role as ClaimAuthorityRole,
      loginEmail,
      authorityConfirmed,
      termsAccepted,
      privacyAccepted,
      sessionIntendedEmailNormalized: claimSession.intendedEmailNormalized,
    });

    if (!result.ok) {
      await recordFail(claimFailureFunnelEvent({ status: result.status, error: result.error }), result.error);
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    if (listingForAudit) {
      await recordClaimFunnelEvent(db, {
        listingId: listingForAudit.id,
        eventType: CLAIM_FUNNEL_EVENT.COMPLETED,
        meta: {
          listingSlug: listingForAudit.slug,
          tokenId: claimSession.tokenId,
          growthLeadId: listingForAudit.growthLeadId,
          decision: result.decision,
        },
      });
    }

    await clearClaimInviteSession();

    if (result.decision === "AUTO_APPROVED") {
      await setSession({
        kind: "venue",
        venueOwnerId: result.ownerId,
        email: loginEmail.trim().toLowerCase(),
      });
      return NextResponse.json({
        ok: true,
        decision: result.decision,
        activationPath: result.activationPath,
        passwordSetupSent: result.passwordSetupSent,
      });
    }

    return NextResponse.json({
      ok: true,
      decision: result.decision,
      reason: result.reason,
      claimRequestId: result.claimRequestId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error("[api/claim/instant]", msg);
    await recordFail(CLAIM_FUNNEL_EVENT.FAILED_OTHER, "exception");
    return NextResponse.json({ ok: false, error: "Claim failed" }, { status: 500 });
  }
}
