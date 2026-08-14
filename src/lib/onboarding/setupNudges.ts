/**
 * Friendly setup nudges for registered venue owners / promoters who skipped optional steps.
 * Idempotent via MarketingEmailSend.purposeKey. Does not send during unit testing.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { deliverResendEmail } from "@/lib/mailer";
import { absoluteUrl } from "@/lib/publicSeo";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";

type NudgeKind = "venue_schedule" | "venue_listing" | "venue_signups" | "promoter_connect";

function subjectFor(kind: NudgeKind): string {
  switch (kind) {
    case "venue_schedule":
      return "Help performers find your next open mic";
    case "venue_listing":
      return "We'll help promote your open mic for free";
    case "venue_signups":
      return "Make open mic signups easier";
    case "promoter_connect":
      return "Connect your open mic on MicStage";
  }
}

function bodyFor(kind: NudgeKind, name: string): { text: string; html: string; cta: string; href: string } {
  if (kind === "venue_schedule") {
    const href = absoluteUrl("/venue#schedule");
    const text = [
      `Hi ${name},`,
      "",
      "Your MicStage page is ready.",
      "",
      "Add or confirm your open mic schedule so performers know when to come.",
      "It only takes a minute.",
      "",
      href,
    ].join("\n");
    return {
      text,
      html: `<p>Hi ${escape(name)},</p><p>Your MicStage page is ready.</p><p>Add or confirm your open mic schedule so performers know when to come. It only takes a minute.</p><p><a href="${href}">Confirm my schedule</a></p>`,
      cta: "Confirm my schedule",
      href,
    };
  }
  if (kind === "venue_listing") {
    const href = absoluteUrl("/venue#profile");
    const text = [
      `Hi ${name},`,
      "",
      "MicStage helps performers discover open mics for free.",
      "",
      "Give us a few details about your night and we'll use them to make your listing more useful and easier to discover.",
      "Add as much or as little as you want.",
      "",
      href,
    ].join("\n");
    return {
      text,
      html: `<p>Hi ${escape(name)},</p><p>MicStage helps performers discover open mics for free.</p><p>Give us a few details about your night and we'll use them to make your listing more useful and easier to discover. Add as much or as little as you want.</p><p><a href="${href}">Improve my listing</a></p>`,
      cta: "Improve my listing",
      href,
    };
  }
  if (kind === "venue_signups") {
    const href = absoluteUrl("/venue#booking");
    const text = [
      `Hi ${name},`,
      "",
      "You can let performers sign up through MicStage instead of managing everything manually.",
      "It's optional and free.",
      "",
      href,
    ].join("\n");
    return {
      text,
      html: `<p>Hi ${escape(name)},</p><p>You can let performers sign up through MicStage instead of managing everything manually. It's optional and free.</p><p><a href="${href}">Set up performer signups</a></p>`,
      cta: "Set up performer signups",
      href,
    };
  }
  const href = absoluteUrl("/promoter");
  const text = [
    `Hi ${name},`,
    "",
    "Your promoter account is ready.",
    "",
    "Connect the open mic you host so performers can find the right night. Search by venue name — no codes needed.",
    "",
    href,
  ].join("\n");
  return {
    text,
    html: `<p>Hi ${escape(name)},</p><p>Your promoter account is ready.</p><p>Connect the open mic you host so performers can find the right night. Search by venue name — no codes needed.</p><p><a href="${href}">Connect my open mic</a></p>`,
    cta: "Connect my open mic",
    href,
  };
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function alreadySent(prisma: PrismaClient, purposeKey: string): Promise<boolean> {
  const row = await prisma.marketingEmailSend.findUnique({
    where: { idempotencyKey: purposeKey },
    select: { id: true },
  });
  return Boolean(row);
}

async function recordSend(
  prisma: PrismaClient,
  input: {
    to: string;
    purposeKey: string;
    kind: NudgeKind;
    subject: string;
    providerMessageId?: string | null;
  },
) {
  const email = normalizeMarketingEmail(input.to) || input.to.toLowerCase();
  const domain = email.split("@")[1] || "unknown";
  await prisma.marketingEmailSend.create({
    data: {
      toEmailNormalized: email,
      toDomain: domain,
      category: "TRANSACTIONAL",
      templateKind: `onboarding_nudge_${input.kind}`,
      purposeKey: input.purposeKey,
      idempotencyKey: input.purposeKey,
      subject: input.subject,
      status: "SENT",
      sentAt: new Date(),
      providerMessageId: input.providerMessageId ?? undefined,
    },
  });
}

export async function runOnboardingSetupNudges(
  prisma: PrismaClient,
  opts?: { limit?: number; now?: Date },
): Promise<{ scanned: number; sent: number; skipped: number }> {
  const now = opts?.now ?? new Date();
  const limit = opts?.limit ?? 20;
  let scanned = 0;
  let sent = 0;
  let skipped = 0;

  const dayMs = 24 * 3600 * 1000;
  const venues = await prisma.venue.findMany({
    where: { createdAt: { lte: new Date(now.getTime() - dayMs) } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      name: true,
      createdAt: true,
      about: true,
      imagePrimaryUrl: true,
      websiteUrl: true,
      facebookUrl: true,
      instagramUrl: true,
      bookingOpensDaysAhead: true,
      owner: { select: { email: true } },
      eventTemplates: { select: { id: true }, take: 1 },
    },
  });

  for (const venue of venues) {
    scanned += 1;
    const ageDays = (now.getTime() - venue.createdAt.getTime()) / dayMs;
    const hasSchedule = venue.eventTemplates.length > 0;
    const hasPhoto = Boolean(venue.imagePrimaryUrl);
    const hasAbout = Boolean(venue.about?.trim());
    const hasSocial = Boolean(venue.websiteUrl || venue.facebookUrl || venue.instagramUrl);
    const bookingOn = (venue.bookingOpensDaysAhead ?? 0) > 0;

    let kind: NudgeKind | null = null;
    if (ageDays >= 1 && ageDays < 3 && !hasSchedule) kind = "venue_schedule";
    else if (ageDays >= 3 && ageDays < 7 && (!hasPhoto || !hasAbout || !hasSocial)) kind = "venue_listing";
    else if (ageDays >= 7 && ageDays < 14 && !bookingOn) kind = "venue_signups";
    if (!kind) {
      skipped += 1;
      continue;
    }

    const purposeKey = `onboarding-nudge:${kind}:venue:${venue.id}`;
    if (await alreadySent(prisma, purposeKey)) {
      skipped += 1;
      continue;
    }

    const subject = subjectFor(kind);
    const body = bodyFor(kind, venue.name);
    try {
      const out = await deliverResendEmail({
        to: venue.owner.email,
        subject,
        text: body.text,
        html: body.html,
        category: "transactional",
        allowDevSkipWhenNoApiKey: true,
      });
      await recordSend(prisma, {
        to: venue.owner.email,
        purposeKey,
        kind,
        subject,
        providerMessageId: out.messageId ?? null,
      });
      if (!out.skipped) sent += 1;
      else skipped += 1;
    } catch (e) {
      console.error("[setupNudges] venue send failed", e);
      skipped += 1;
    }
  }

  const promoters = await prisma.promoterUser.findMany({
    where: {
      createdAt: { lte: new Date(now.getTime() - dayMs) },
      venueAccess: { none: {} },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(10, limit),
    select: {
      id: true,
      email: true,
      createdAt: true,
      application: { select: { contactName: true } },
    },
  });

  for (const p of promoters) {
    scanned += 1;
    const ageDays = (now.getTime() - p.createdAt.getTime()) / dayMs;
    if (ageDays < 1 || ageDays > 10) {
      skipped += 1;
      continue;
    }
    const kind: NudgeKind = "promoter_connect";
    const purposeKey = `onboarding-nudge:${kind}:promoter:${p.id}`;
    if (await alreadySent(prisma, purposeKey)) {
      skipped += 1;
      continue;
    }
    const name = p.application?.contactName?.split(/\s+/)[0] || "there";
    const subject = subjectFor(kind);
    const body = bodyFor(kind, name);
    try {
      const out = await deliverResendEmail({
        to: p.email,
        subject,
        text: body.text,
        html: body.html,
        category: "transactional",
        allowDevSkipWhenNoApiKey: true,
      });
      await recordSend(prisma, {
        to: p.email,
        purposeKey,
        kind,
        subject,
        providerMessageId: out.messageId ?? null,
      });
      if (!out.skipped) sent += 1;
      else skipped += 1;
    } catch (e) {
      console.error("[setupNudges] promoter send failed", e);
      skipped += 1;
    }
  }

  return { scanned, sent, skipped };
}
