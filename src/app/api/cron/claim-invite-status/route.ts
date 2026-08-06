import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { APPROVED_CLAIM_CANARY_SLUGS } from "@/lib/publicListings/sendApprovedClaimCanary";
import {
  claimInviteDailyBudgetSnapshot,
  getClaimInvitePauseState,
  getClaimInviteRollingStats,
  redactEmail,
} from "@/lib/publicListings/claimInviteAutomation";
import {
  resolveClaimInviteRuntimeSnapshot,
  runtimeSnapshotForStatus,
} from "@/lib/publicListings/claimInviteRuntimeSettings";
import { countEligiblePendingListingClaimInvites } from "@/lib/publicListings/claimInvitePendingCount";
import { startOfUtcDay } from "@/lib/marketing/sendCaps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) return true;
  return request.headers.get("x-micstage-cron-secret") === expected;
}

/**
 * Read-only claim automation + canary status. Auth required. No raw tokens / full emails.
 */
export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "database_unavailable" }, { status: 503 });
  }

  const pause = await getClaimInvitePauseState(prisma);
  const daily = await claimInviteDailyBudgetSnapshot(prisma);
  const stats = await getClaimInviteRollingStats(prisma);
  const eligibleApprox = await countEligiblePendingListingClaimInvites(prisma);
  const snap = await resolveClaimInviteRuntimeSnapshot(prisma);
  const since = startOfUtcDay();

  const canaries = [];
  for (const slug of Object.keys(APPROVED_CLAIM_CANARY_SLUGS)) {
    const listing = await prisma.publicOpenMicListing.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        claimStatus: true,
        verificationStatus: true,
        claimedVenueId: true,
        claimInviteEmailSentAt: true,
        claimInviteEmail: true,
        claimInviteProviderMessageId: true,
      },
    });
    if (!listing) {
      canaries.push({ slug, found: false });
      continue;
    }
    const tokens = await prisma.listingClaimInviteToken.groupBy({
      by: ["status"],
      where: { listingId: listing.id },
      _count: true,
    });
    const claims = await prisma.listingClaimRequest.count({ where: { listingId: listing.id } });
    canaries.push({
      slug: listing.slug,
      name: listing.name,
      verificationStatus: listing.verificationStatus,
      claimStatus: listing.claimStatus,
      recipientRedacted: listing.claimInviteEmail ? redactEmail(listing.claimInviteEmail) : null,
      providerAccepted: Boolean(listing.claimInviteProviderMessageId),
      providerMessageIdRedacted: listing.claimInviteProviderMessageId
        ? `${listing.claimInviteProviderMessageId.slice(0, 4)}…${listing.claimInviteProviderMessageId.slice(-4)}`
        : null,
      claimInviteEmailSentAt: listing.claimInviteEmailSentAt,
      tokenCounts: Object.fromEntries(tokens.map((t) => [t.status, t._count])),
      claimRequests: claims,
      venueLinked: Boolean(listing.claimedVenueId),
    });
  }

  const sentToday = await prisma.publicOpenMicListing.findMany({
    where: { claimInviteEmailSentAt: { gte: since } },
    select: {
      slug: true,
      name: true,
      claimInviteEmail: true,
      claimInviteProviderMessageId: true,
      claimInviteEmailSentAt: true,
      region: true,
    },
    orderBy: { claimInviteEmailSentAt: "desc" },
    take: 20,
  });

  const bookable = await prisma.eventTemplate.count({ where: { isPublic: true } });
  const claimed = await prisma.publicOpenMicListing.count({ where: { claimStatus: "CLAIMED" } });
  const owners = await prisma.venueOwner.count();
  const venues = await prisma.venue.count();

  return NextResponse.json({
    ok: true,
    runtime: runtimeSnapshotForStatus(snap),
    gates: {
      claimInvitesEnabled: snap.claimInvitesEnabled,
      effectivePerCron: snap.effectivePerCron,
      dailyMax: daily.max,
      sentToday: daily.sentTodayUtc,
      remainingToday: daily.remaining,
      paused: pause.paused,
      pauseReason: pause.reason,
    },
    rollingStats: stats,
    eligibleApprox,
    canaries,
    sentTodayRedacted: sentToday.map((r) => ({
      slug: r.slug,
      name: r.name,
      region: r.region,
      recipientRedacted: r.claimInviteEmail ? redactEmail(r.claimInviteEmail) : null,
      providerMessageIdRedacted: r.claimInviteProviderMessageId
        ? `${r.claimInviteProviderMessageId.slice(0, 4)}…${r.claimInviteProviderMessageId.slice(-4)}`
        : null,
      sentAt: r.claimInviteEmailSentAt,
    })),
    activity: {
      claimedListings: claimed,
      venueOwners: owners,
      venues,
      bookableTemplates: bookable,
    },
    outreachNote: "General cold marketing outreach is separate and not enabled by this report.",
  });
}
