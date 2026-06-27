import type { PrismaClient } from "@/generated/prisma/client";
import { deliverResendEmail } from "@/lib/mailer";
import { appBaseUrl } from "@/lib/marketing/emailConfig";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { transactionalFromAddress } from "@/lib/marketing/emailConfig";

const REPLY_TO = "drummer@micstage.com";

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
}): { subject: string; textBody: string; htmlBody: string } {
  const base = appBaseUrl().replace(/\/$/, "");
  const listingUrl = `${base}/open-mics/${encodeURIComponent(input.listingSlug)}`;
  const claimUrl = `${base}/claim/${encodeURIComponent(input.listingSlug)}`;
  const registerUrl = `${base}/register/venue`;
  const place = [input.city, input.region].filter(Boolean).join(", ");
  const subject = `Claim ${input.listingName} on MicStage — free open mic tools`;

  const intro = place
    ? `We added ${input.listingName} in ${place} to MicStage as a verified open mic listing so local performers can find it.`
    : `We added ${input.listingName} to MicStage as a verified open mic listing so local performers can find it.`;

  const policy =
    "Right now this is a basic verified listing only. We do not run proactive marketing for your room until you claim it, set up your schedule, and start using MicStage.";

  const cta =
    "Run this open mic? Claim your page free — we will connect you to a venue account and help you take over the listing.";

  const servicesText = MICSTAGE_VENUE_FREE_SERVICES.map((s) => `- ${s}`).join("\n");
  const servicesHtml = MICSTAGE_VENUE_FREE_SERVICES.map((s) => `<li>${escapeHtml(s)}</li>`).join("");

  const textBody = [
    "Hi there,",
    "",
    intro,
    policy,
    "",
    cta,
    "",
    `View the listing: ${listingUrl}`,
    `Claim this open mic (free): ${claimUrl}`,
    `Or register your venue directly: ${registerUrl}`,
    "",
    "Everything included free when you claim and go live:",
    servicesText,
    "",
    "Questions? Reply to this email — happy to help you get set up.",
    "",
    "Thanks,",
    "Chris",
    "MicStage",
  ].join("\n");

  const htmlBody = [
    "<p>Hi there,</p>",
    `<p>${escapeHtml(intro)} ${escapeHtml(policy)}</p>`,
    `<p><strong>${escapeHtml(cta)}</strong></p>`,
    `<p><a href="${escapeHtml(listingUrl)}">View the listing</a> · <a href="${escapeHtml(claimUrl)}">Claim this open mic (free)</a></p>`,
    `<p>New venue? <a href="${escapeHtml(registerUrl)}">Register your venue</a></p>`,
    "<p><strong>Everything included free when you claim and go live:</strong></p>",
    `<ul style="margin:0 0 1em 1.2em;padding:0;">${servicesHtml}</ul>`,
    "<p>Questions? Reply to this email — happy to help you get set up.</p>",
    "<p>Thanks,<br />Chris<br />MicStage</p>",
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

async function sendTransactional(to: string, subject: string, textBody: string, htmlBody: string): Promise<boolean> {
  const normalized = normalizeMarketingEmail(to);
  if (!normalized) return false;

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
    return false;
  }
  return true;
}

/**
 * Sends one claim invite per listing (idempotent). Uses growth lead email when not overridden.
 */
export async function sendListingClaimInviteIfNeeded(
  prisma: PrismaClient,
  listingId: string,
  toEmail?: string | null,
): Promise<{ sent: boolean; reason?: string }> {
  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { id: listingId },
    include: { growthLead: { select: { contactEmailNormalized: true } } },
  });
  if (!listing) return { sent: false, reason: "listing_not_found" };
  if (listing.claimInviteEmailSentAt) return { sent: false, reason: "already_sent" };
  if (listing.claimedVenueId || listing.claimStatus === "CLAIMED") {
    return { sent: false, reason: "already_claimed" };
  }

  const rawEmail = toEmail ?? listing.growthLead?.contactEmailNormalized ?? null;
  const email = rawEmail ? normalizeMarketingEmail(rawEmail) : null;
  if (!email) return { sent: false, reason: "no_email" };

  const payload = buildListingClaimInvitePayload({
    listingName: listing.name,
    listingSlug: listing.slug,
    city: listing.city,
    region: listing.region,
  });

  const ok = await sendTransactional(email, payload.subject, payload.textBody, payload.htmlBody);
  if (!ok) return { sent: false, reason: "send_skipped_or_failed" };

  await prisma.publicOpenMicListing.update({
    where: { id: listingId },
    data: {
      claimInviteEmailSentAt: new Date(),
      claimInviteEmail: email,
    },
  });

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

/** Growth cold outreach should not run while a public listing exists but is not yet live on MicStage. */
export async function leadBlocksGrowthOutreach(
  prisma: PrismaClient,
  leadId: string,
): Promise<boolean> {
  const n = await prisma.publicOpenMicListing.count({
    where: {
      growthLeadId: leadId,
      verificationStatus: { not: "OUTDATED" },
      promotionEligibleAt: null,
    },
  });
  return n > 0;
}

/** True when lead has an unclaimed public listing (claim invite path instead of cold outreach). */
export async function leadHasUnclaimedPublicListing(
  prisma: PrismaClient,
  leadId: string,
): Promise<boolean> {
  const n = await prisma.publicOpenMicListing.count({
    where: {
      growthLeadId: leadId,
      claimedVenueId: null,
      claimStatus: { not: "CLAIMED" },
      verificationStatus: { not: "OUTDATED" },
    },
  });
  return n > 0;
}

/** Sends pending claim invites (bounded batch). Safe to run on every growth cron tick. */
export async function runPendingListingClaimInvites(
  prisma: PrismaClient,
  limit = 20,
): Promise<{ sent: number; skipped: number; candidates: number }> {
  const pending = await prisma.publicOpenMicListing.findMany({
    where: {
      claimInviteEmailSentAt: null,
      claimedVenueId: null,
      claimStatus: { not: "CLAIMED" },
      verificationStatus: { not: "OUTDATED" },
      growthLead: { contactEmailNormalized: { not: null } },
    },
    select: { id: true, growthLead: { select: { contactEmailNormalized: true } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let skipped = 0;
  for (const row of pending) {
    const result = await sendListingClaimInviteIfNeeded(
      prisma,
      row.id,
      row.growthLead?.contactEmailNormalized,
    );
    if (result.sent) sent += 1;
    else skipped += 1;
  }

  return { sent, skipped, candidates: pending.length };
}
