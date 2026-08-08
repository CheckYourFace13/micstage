import type { PrismaClient } from "@/generated/prisma/client";
import { deliverResendEmail } from "@/lib/mailer";
import { appBaseUrl } from "@/lib/marketing/emailConfig";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { transactionalFromAddress } from "@/lib/marketing/emailConfig";
import { resolveClaimInviteRuntimeSnapshot } from "@/lib/publicListings/claimInviteRuntimeSettings";
import { resendDailyBudgetSnapshot } from "@/lib/resendDailyBudget";
import { issueListingClaimInviteToken } from "@/lib/publicListings/claimInviteToken";
import { isMarketingEmailSuppressed } from "@/lib/marketing/suppression";
import {
  claimInviteAutomationMaySend,
  claimInviteDailyBudgetSnapshot,
  countClaimInvitesSentTodayForDomain,
  getClaimInvitePauseState,
  isStagedClaimInviteContactEligible,
  listingClaimInvitesPerDomainDailyMax,
  listingPassesStagedClaimInviteSafety,
  recordClaimInviteSendStat,
} from "@/lib/publicListings/claimInviteAutomation";
import type { GrowthLeadOpenMicSignalTier } from "@/generated/prisma/client";

const REPLY_TO = "drummer@micstage.com";

export { CLAIM_INVITE_LISTING_WHERE, isClaimInviteEmailEligible } from "@/lib/publicListings/claimInviteEligibility";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Everything MicStage offers venues at no cost — used in claim invite copy. */
export const MICSTAGE_VENUE_FREE_SERVICES = [
  "Free venue account — no subscription required to run your open mic",
  "Public open mic page with a stable, shareable link",
  "Recurring schedule and slot-length setup",
  "Online booking so performers reserve slots without double-booking",
  "Shareable lineup board and QR code for walk-up signup",
  "Optional on-site booking rules (hours-before or geofence)",
  "Public discovery on MicStage (map, find-open-mics, metro pages) once you claim and publish your schedule",
  "Proactive marketing help from MicStage once your room is live and bookable — not before",
  "Messaging with performers and lineup history tools",
] as const;

export function buildListingClaimInvitePayload(input: {
  listingName: string;
  listingSlug: string;
  city: string | null;
  region: string | null;
  /** Prefer signed token URL when available. Use "[SECURE CLAIM LINK]" in previews. */
  claimUrl?: string;
  venueName?: string | null;
}): { subject: string; textBody: string; htmlBody: string } {
  const base = appBaseUrl().replace(/\/$/, "");
  const listingUrl = `${base}/open-mics/${encodeURIComponent(input.listingSlug)}`;
  const claimUrl =
    input.claimUrl?.trim() || `${base}/claim/${encodeURIComponent(input.listingSlug)}`;
  const openMicName = (input.venueName?.trim() || input.listingName).trim();
  const subject = "Claim your free MicStage open mic listing";

  // Keep the official title intact. Names that already end in sentence punctuation
  // use "the …" so the following "and" remains grammatically clear.
  const foundLead = /[.!?]$/.test(openMicName) ? "We found the" : "We found your";
  const foundSentence = `${foundLead} ${openMicName} and created a free verified listing on MicStage so more performers can discover it.`;

  const textBody = [
    "Hi,",
    "",
    foundSentence,
    "",
    "MicStage was created by an open-mic organizer who wanted an easier way to manage schedules, promote events, and organize performer signups. It is free and simple to use, and online booking remains optional.",
    "",
    "No account has been created for you. If you are authorized to manage this open mic, use the secure link below to claim the listing, confirm the details, and publish your schedule.",
    "",
    claimUrl,
    "",
    "View the current listing:",
    "",
    listingUrl,
    "",
    "The claim link is private and expires. If you are not the correct person, reply and let us know.",
    "",
    "Thanks,",
    "Chris",
    "MicStage",
  ].join("\n");

  // Email-safe, short HTML — no images, tracking pixels, or heavy branding.
  const htmlBody = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;">',
    "<p style=\"margin:0 0 16px 0;\">Hi,</p>",
    `<p style="margin:0 0 16px 0;">${escapeHtml(foundSentence)}</p>`,
    '<p style="margin:0 0 16px 0;">MicStage was created by an open-mic organizer who wanted an easier way to manage schedules, promote events, and organize performer signups. It is free and simple to use, and online booking remains optional.</p>',
    '<p style="margin:0 0 20px 0;">No account has been created for you. If you are authorized to manage this open mic, use the secure link below to claim the listing, confirm the details, and publish your schedule.</p>',
    `<p style="margin:0 0 20px 0;"><a href="${escapeHtml(claimUrl)}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">Claim Your Free Listing</a></p>`,
    '<p style="margin:0 0 8px 0;">View the current listing:</p>',
    `<p style="margin:0 0 20px 0;"><a href="${escapeHtml(listingUrl)}" style="color:#111827;">${escapeHtml(listingUrl)}</a></p>`,
    '<p style="margin:0 0 16px 0;">The claim link is private and expires. If you are not the correct person, reply and let us know.</p>',
    '<p style="margin:0;">Thanks,<br />Chris<br />MicStage</p>',
    "</div>",
  ].join("");

  return { subject, textBody, htmlBody };
}

export function buildListingClaimReceivedPayload(input: {
  listingName: string;
  listingSlug: string;
  contactName: string;
}): { subject: string; textBody: string; htmlBody: string } {
  const base = appBaseUrl().replace(/\/$/, "");
  const listingUrl = `${base}/open-mics/${encodeURIComponent(input.listingSlug)}`;
  const subject = `We received your claim for ${input.listingName}`;

  const textBody = [
    `Hi ${input.contactName},`,
    "",
    `Thanks — we received your claim request for ${input.listingName} on MicStage.`,
    "Our team will review it shortly and email you next steps to connect your venue account.",
    "",
    `Listing: ${listingUrl}`,
    "",
    "MicStage is completely free for venues. Once approved, you can publish your schedule, take bookings, and unlock marketing help from us.",
    "",
    "Thanks,",
    "Chris",
    "MicStage",
  ].join("\n");

  const htmlBody = [
    `<p>Hi ${escapeHtml(input.contactName)},</p>`,
    `<p>Thanks — we received your claim request for <strong>${escapeHtml(input.listingName)}</strong> on MicStage. Our team will review it shortly and email you next steps.</p>`,
    `<p><a href="${escapeHtml(listingUrl)}">View listing</a></p>`,
    "<p>MicStage is completely free for venues. Once approved, you can publish your schedule, take bookings, and unlock marketing help from us.</p>",
    "<p>Thanks,<br />Chris<br />MicStage</p>",
  ].join("");

  return { subject, textBody, htmlBody };
}

export function buildListingClaimApprovedPayload(input: {
  listingName: string;
  listingSlug: string;
  venueSlug?: string | null;
}): { subject: string; textBody: string; htmlBody: string } {
  const base = appBaseUrl().replace(/\/$/, "");
  const listingUrl = `${base}/open-mics/${encodeURIComponent(input.listingSlug)}`;
  const venueUrl = input.venueSlug ? `${base}/venues/${encodeURIComponent(input.venueSlug)}` : null;
  const registerUrl = `${base}/register/venue`;
  const subject = `You're approved — take over ${input.listingName} on MicStage`;

  const servicesText = MICSTAGE_VENUE_FREE_SERVICES.map((s) => `- ${s}`).join("\n");

  const textBody = [
    "Hi there,",
    "",
    `Your claim for ${input.listingName} is approved.`,
    venueUrl
      ? `Your venue page: ${venueUrl}`
      : `Create or sign in to your free venue account: ${registerUrl}`,
    "",
    "Next steps:",
    "1. Sign in and confirm your open mic schedule",
    "2. Publish bookable slots",
    "3. Share your lineup link or QR code",
    "",
    "Once your schedule is live, MicStage will include your room in proactive marketing (discovery emails, metro features, and performer outreach in your area). We do not market unclaimed listings.",
    "",
    "Free with MicStage:",
    servicesText,
    "",
    `Public listing (until fully linked): ${listingUrl}`,
    "",
    "Reply if you want help with the first setup — happy to walk you through it.",
    "",
    "Thanks,",
    "Chris",
    "MicStage",
  ].join("\n");

  const venueLinkHtml = venueUrl
    ? '<p><a href="' + escapeHtml(venueUrl) + '">Open your venue page</a></p>'
    : '<p><a href="' + escapeHtml(registerUrl) + '">Create your free venue account</a></p>';

  const htmlBody = [
    "<p>Hi there,</p>",
    `<p>Your claim for <strong>${escapeHtml(input.listingName)}</strong> is approved.</p>`,
    venueLinkHtml,
    "<p><strong>Next steps:</strong></p>",
    "<ol><li>Confirm your open mic schedule</li><li>Publish bookable slots</li><li>Share your lineup link or QR code</li></ol>",
    "<p>Once your schedule is live, MicStage will include your room in proactive marketing. We do not market unclaimed listings.</p>",
    `<ul style="margin:0 0 1em 1.2em;padding:0;">${MICSTAGE_VENUE_FREE_SERVICES.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`,
    `<p><a href="${escapeHtml(listingUrl)}">Public listing</a></p>`,
    "<p>Reply if you want help with setup.</p>",
    "<p>Thanks,<br />Chris<br />MicStage</p>",
  ].join("");

  return { subject, textBody, htmlBody };
}

async function sendTransactional(
  to: string,
  subject: string,
  textBody: string,
  htmlBody: string,
): Promise<{ ok: boolean; messageId?: string }> {
  const normalized = normalizeMarketingEmail(to);
  if (!normalized) return { ok: false };

  const out = await deliverResendEmail({
    to: normalized,
    subject,
    text: textBody,
    html: htmlBody,
    category: "transactional",
    fromOverride: transactionalFromAddress(),
    replyTo: REPLY_TO,
    allowDevSkipWhenNoApiKey: true,
  });

  if (out.skipped) {
    console.warn("[listingClaimEmail] skipped (no Resend key)");
    return { ok: false };
  }
  return { ok: true, messageId: out.messageId };
}

/**
 * One-touch claim invite: VERIFIED public listings with HIGH official-domain contact.
 * Idempotent via claimInviteEmailSentAt. Honors pause + claim-invite daily cap.
 */
export async function sendListingClaimInviteIfNeeded(
  prisma: PrismaClient,
  listingId: string,
  toEmail?: string | null,
): Promise<{ sent: boolean; reason?: string }> {
  const runtime = await resolveClaimInviteRuntimeSnapshot(prisma);
  if (!runtime.claimInvitesEnabled) {
    return { sent: false, reason: "claim_invites_disabled" };
  }
  const pause = await getClaimInvitePauseState(prisma);
  if (pause.paused) {
    return { sent: false, reason: `paused:${pause.reason ?? "unknown"}` };
  }
  const claimDaily = await claimInviteDailyBudgetSnapshot(prisma);
  if (claimDaily.remaining <= 0) {
    return { sent: false, reason: "daily_claim_invite_cap" };
  }

  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { id: listingId },
    include: {
      growthLead: {
        select: {
          contactEmailNormalized: true,
          contactEmailConfidence: true,
          websiteUrl: true,
          discoveryMarketSlug: true,
        },
      },
    },
  });
  if (!listing) return { sent: false, reason: "listing_not_found" };
  if (listing.claimInviteEmailSentAt) return { sent: false, reason: "already_sent" };
  if (listing.claimedVenueId || listing.claimStatus === "CLAIMED") {
    return { sent: false, reason: "already_claimed" };
  }

  const safety = listingPassesStagedClaimInviteSafety({
    ...listing,
    discoveryMarketSlug: listing.growthLead?.discoveryMarketSlug,
  });
  if (!safety.ok) return { sent: false, reason: safety.reason };

  const rawEmail = toEmail ?? listing.growthLead?.contactEmailNormalized ?? null;
  const email = rawEmail ? normalizeMarketingEmail(rawEmail) : null;
  if (!email) return { sent: false, reason: "no_email" };

  const suppressed = await isMarketingEmailSuppressed(prisma, email);
  if (suppressed.suppressed) {
    return { sent: false, reason: `suppressed:${suppressed.reason ?? "unknown"}` };
  }

  if (
    !isStagedClaimInviteContactEligible({
      email,
      confidence: listing.growthLead?.contactEmailConfidence,
      websiteUrl: listing.websiteUrl ?? listing.growthLead?.websiteUrl,
      sourceUrl: listing.sourceUrl,
    })
  ) {
    return { sent: false, reason: "email_not_eligible" };
  }

  const domain = email.slice(email.indexOf("@") + 1).toLowerCase();
  const domainSent = await countClaimInvitesSentTodayForDomain(prisma, domain);
  if (domainSent >= listingClaimInvitesPerDomainDailyMax()) {
    return { sent: false, reason: "domain_daily_cap" };
  }

  const activeTokens = await prisma.listingClaimInviteToken.count({
    where: { listingId, status: "ACTIVE", expiresAt: { gt: new Date() } },
  });
  if (activeTokens > 0) return { sent: false, reason: "active_token_exists" };

  const issued = await issueListingClaimInviteToken(prisma, {
    listingId,
    intendedEmailNormalized: email,
  });
  const base = appBaseUrl().replace(/\/$/, "");
  // Token in path — not query string (reduces referrer leakage). Never log rawToken.
  const claimUrl = `${base}/claim/invite/${issued.rawToken}`;

  const payload = buildListingClaimInvitePayload({
    listingName: listing.name,
    listingSlug: listing.slug,
    city: listing.city,
    region: listing.region,
    venueName: listing.name,
    claimUrl,
  });

  const sendResult = await sendTransactional(email, payload.subject, payload.textBody, payload.htmlBody);
  if (!sendResult.ok) {
    // Revoke unused token if send failed so it cannot be guessed from a partial path
    await prisma.listingClaimInviteToken.update({
      where: { id: issued.tokenId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    return { sent: false, reason: "send_skipped_or_failed" };
  }

  // Stamp only after provider acceptance (messageId when available).
  await prisma.publicOpenMicListing.update({
    where: { id: listingId },
    data: {
      claimInviteEmailSentAt: new Date(),
      claimInviteEmail: email,
      claimInviteProviderMessageId: sendResult.messageId ?? null,
    },
  });

  await prisma.listingClaimAuditEvent.create({
    data: {
      listingId,
      eventType: "CLAIM_INVITE_SENT",
      meta: {
        tokenId: issued.tokenId,
        hasProviderMessageId: Boolean(sendResult.messageId),
        emailDomain: domain,
      },
    },
  });

  await recordClaimInviteSendStat(prisma);

  return { sent: true };
}

export async function sendListingClaimReceivedEmail(input: {
  to: string;
  listingName: string;
  listingSlug: string;
  contactName: string;
}): Promise<void> {
  const payload = buildListingClaimReceivedPayload(input);
  await sendTransactional(input.to, payload.subject, payload.textBody, payload.htmlBody);
}

export async function sendListingClaimApprovedEmail(input: {
  to: string;
  listingName: string;
  listingSlug: string;
  venueSlug?: string | null;
}): Promise<void> {
  const payload = buildListingClaimApprovedPayload(input);
  await sendTransactional(input.to, payload.subject, payload.textBody, payload.htmlBody);
}

/** True when linked venue has at least one public template — unlocks proactive marketing. */
export async function refreshListingPromotionEligible(
  prisma: PrismaClient,
  listingId: string,
): Promise<boolean> {
  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { id: listingId },
    select: { id: true, claimedVenueId: true, promotionEligibleAt: true },
  });
  if (!listing?.claimedVenueId) return false;

  const publicTemplates = await prisma.eventTemplate.count({
    where: { venueId: listing.claimedVenueId, isPublic: true },
  });
  if (publicTemplates === 0) return false;

  if (!listing.promotionEligibleAt) {
    await prisma.publicOpenMicListing.update({
      where: { id: listingId },
      data: { promotionEligibleAt: new Date() },
    });
  }
  return true;
}

/**
 * Cold outreach is blocked only when a public VERIFIED listing is waiting to be claimed/go-live.
 * Hidden NEEDS_REVIEW rows no longer block nationwide outreach.
 */
export async function leadBlocksGrowthOutreach(
  prisma: PrismaClient,
  leadId: string,
): Promise<boolean> {
  const n = await prisma.publicOpenMicListing.count({
    where: {
      growthLeadId: leadId,
      verificationStatus: "VERIFIED",
      promotionEligibleAt: null,
    },
  });
  return n > 0;
}

/** True when lead has an unclaimed VERIFIED public listing (claim invite path instead of cold outreach). */
export async function leadHasUnclaimedPublicListing(
  prisma: PrismaClient,
  leadId: string,
): Promise<boolean> {
  const n = await prisma.publicOpenMicListing.count({
    where: {
      growthLeadId: leadId,
      claimedVenueId: null,
      claimStatus: { not: "CLAIMED" },
      verificationStatus: "VERIFIED",
    },
  });
  return n > 0;
}

/** Priority score for staged claim-invite selection (higher = sooner). */
function claimInvitePriorityScore(input: {
  openMicSignalTier: GrowthLeadOpenMicSignalTier | null | undefined;
  region: string | null;
  city: string | null;
  createdAt: Date;
}): number {
  let score = 0;
  const tier = input.openMicSignalTier;
  if (tier === "EXPLICIT_OPEN_MIC") score += 100;
  else if (tier === "STRONG_LIVE_EVENT") score += 60;
  else if (tier === "WEAK_INFERRED") score += 20;
  // Mild geographic diversity boost for non-IL when quality is equal-ish
  const region = (input.region || "").toUpperCase();
  if (region && region !== "IL") score += 5;
  // Older listings slightly preferred
  score += Math.min(30, Math.floor((Date.now() - input.createdAt.getTime()) / (86400000 * 7)));
  return score;
}

/** Sends pending claim invites for VERIFIED listings only (bounded batch). */
export async function runPendingListingClaimInvites(
  prisma: PrismaClient,
  limit = 5,
): Promise<{
  sent: number;
  skipped: number;
  candidates: number;
  budgetBlocked?: boolean;
  paused?: boolean;
  pauseReason?: string | null;
}> {
  const may = await claimInviteAutomationMaySend(prisma);
  if (!may.ok) {
    return {
      sent: 0,
      skipped: 0,
      candidates: 0,
      budgetBlocked: may.reason === "daily_claim_invite_cap" || may.reason === "claim_invites_disabled",
      paused: may.reason?.startsWith("paused:"),
      pauseReason: may.reason?.startsWith("paused:") ? may.reason.slice(7) : null,
    };
  }

  const { remaining: resendRemaining } = await resendDailyBudgetSnapshot(prisma);
  if (resendRemaining <= 0) {
    return { sent: 0, skipped: 0, candidates: 0, budgetBlocked: true };
  }

  const effectiveLimit = Math.min(limit, may.perCron, may.dailyRemaining, resendRemaining);
  if (effectiveLimit <= 0) {
    return { sent: 0, skipped: 0, candidates: 0, budgetBlocked: true };
  }

  const pending = await prisma.publicOpenMicListing.findMany({
    where: {
      claimInviteEmailSentAt: null,
      claimedVenueId: null,
      claimStatus: { not: "CLAIMED" },
      verificationStatus: "VERIFIED",
      googlePlaceId: { not: null },
      growthLead: {
        contactEmailNormalized: { not: null },
        contactEmailConfidence: "HIGH",
      },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      websiteUrl: true,
      sourceUrl: true,
      city: true,
      region: true,
      formattedAddress: true,
      createdAt: true,
      verificationStatus: true,
      claimStatus: true,
      claimedVenueId: true,
      googlePlaceId: true,
      evidenceTerminalReason: true,
      internalNotes: true,
      about: true,
      growthLead: {
        select: {
          contactEmailNormalized: true,
          contactEmailConfidence: true,
          websiteUrl: true,
          openMicSignalTier: true,
          discoveryMarketSlug: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(effectiveLimit * 20, 40),
  });

  const ranked = [...pending].sort(
    (a, b) =>
      claimInvitePriorityScore({
        openMicSignalTier: b.growthLead?.openMicSignalTier,
        region: b.region,
        city: b.city,
        createdAt: b.createdAt,
      }) -
      claimInvitePriorityScore({
        openMicSignalTier: a.growthLead?.openMicSignalTier,
        region: a.region,
        city: a.city,
        createdAt: a.createdAt,
      }),
  );

  // Soft geographic diversity: avoid sending all to the same region in one tick when alternatives exist.
  const regionSentThisTick = new Set<string>();

  let sent = 0;
  let skipped = 0;
  let candidates = 0;
  for (const row of ranked) {
    if (sent >= effectiveLimit) break;

    const safety = listingPassesStagedClaimInviteSafety({
      ...row,
      discoveryMarketSlug: row.growthLead?.discoveryMarketSlug,
    });
    if (!safety.ok) {
      skipped += 1;
      continue;
    }

    const email = row.growthLead?.contactEmailNormalized;
    if (
      !email ||
      !isStagedClaimInviteContactEligible({
        email,
        confidence: row.growthLead?.contactEmailConfidence,
        websiteUrl: row.websiteUrl ?? row.growthLead?.websiteUrl,
        sourceUrl: row.sourceUrl,
      })
    ) {
      skipped += 1;
      continue;
    }

    const regionKey = (row.region || row.city || "unknown").toUpperCase();
    if (regionSentThisTick.has(regionKey) && ranked.length > effectiveLimit) {
      // Prefer diversity when we have surplus candidates; still allow if we are short.
      const remainingCandidates = ranked.length - (sent + skipped);
      if (remainingCandidates > effectiveLimit - sent) {
        skipped += 1;
        continue;
      }
    }

    candidates += 1;
    const result = await sendListingClaimInviteIfNeeded(prisma, row.id, email);
    if (result.sent) {
      sent += 1;
      regionSentThisTick.add(regionKey);
    } else skipped += 1;
  }

  return { sent, skipped, candidates };
}
