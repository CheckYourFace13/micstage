import type { GrowthLeadAcquisitionStage, GrowthLeadType } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

const ORDER: GrowthLeadAcquisitionStage[] = [
  "DISCOVERED",
  "OUTREACH_DRAFTED",
  "OUTREACH_SENT",
  "CLICKED",
  "SIGNUP_STARTED",
  "ACCOUNT_CREATED",
  "LISTING_LIVE",
];

const GROWTH_LEAD_ID_RE = /^c[a-z0-9]{24}$/i;

export function isGrowthLeadId(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && GROWTH_LEAD_ID_RE.test(raw.trim());
}

export function normalizeGrowthLeadId(raw: string): string {
  return raw.trim();
}

function stageIndex(s: GrowthLeadAcquisitionStage): number {
  return ORDER.indexOf(s);
}

/**
 * Advances acquisition stage only forward (never downgrades).
 *
 * Milestone timestamps are stamped only for the stage being entered:
 * - SIGNUP_STARTED → signupStartedAt (form interaction; not page load)
 * - ACCOUNT_CREATED → accountCreatedAt
 * - LISTING_LIVE → listingLiveAt
 *
 * registrationViewedAt / registrationSubmittedAt are stamped by dedicated helpers
 * so page view and submit are not collapsed into SIGNUP_STARTED / ACCOUNT_CREATED.
 */
export async function advanceGrowthLeadAcquisitionStage(
  prisma: PrismaClient,
  leadId: string,
  target: GrowthLeadAcquisitionStage,
  opts?: { leadType?: GrowthLeadType },
): Promise<void> {
  const lead = await prisma.growthLead.findFirst({
    where: { id: leadId, ...(opts?.leadType ? { leadType: opts.leadType } : {}) },
    select: {
      acquisitionStage: true,
      signupStartedAt: true,
      accountCreatedAt: true,
      listingLiveAt: true,
    },
  });
  if (!lead) return;
  const cur = lead.acquisitionStage;
  if (stageIndex(target) <= stageIndex(cur)) {
    // Stage already at/past target — still fill missing ACCOUNT_CREATED / LISTING_LIVE stamps
    // when explicitly advancing to those stages (idempotent first-touch).
    if (target === "ACCOUNT_CREATED" && !lead.accountCreatedAt) {
      await prisma.growthLead.update({
        where: { id: leadId },
        data: { accountCreatedAt: new Date() },
      });
    } else if (target === "LISTING_LIVE" && !lead.listingLiveAt) {
      await prisma.growthLead.update({
        where: { id: leadId },
        data: { listingLiveAt: new Date() },
      });
    } else if (target === "SIGNUP_STARTED" && !lead.signupStartedAt) {
      await prisma.growthLead.update({
        where: { id: leadId },
        data: { signupStartedAt: new Date() },
      });
    }
    return;
  }

  const now = new Date();
  const data: {
    acquisitionStage: GrowthLeadAcquisitionStage;
    signupStartedAt?: Date;
    accountCreatedAt?: Date;
    listingLiveAt?: Date;
  } = { acquisitionStage: target };

  // Only stamp signupStartedAt when entering SIGNUP_STARTED — never as a side-effect
  // of jumping to ACCOUNT_CREATED (that used to inflate form-start counts from page loads).
  if (target === "SIGNUP_STARTED" && !lead.signupStartedAt) {
    data.signupStartedAt = now;
  }
  if (stageIndex(target) >= stageIndex("ACCOUNT_CREATED") && !lead.accountCreatedAt) {
    data.accountCreatedAt = now;
  }
  if (stageIndex(target) >= stageIndex("LISTING_LIVE") && !lead.listingLiveAt) {
    data.listingLiveAt = now;
  }

  await prisma.growthLead.update({
    where: { id: leadId },
    data,
  });
}

/**
 * Registration page load for an attributed lead: CLICKED + registrationViewedAt once.
 * Does NOT set SIGNUP_STARTED / signupStartedAt.
 */
export async function stampRegistrationPageViewed(
  prisma: PrismaClient,
  leadId: string,
  opts?: { leadType?: GrowthLeadType },
): Promise<void> {
  if (!isGrowthLeadId(leadId)) return;
  const id = normalizeGrowthLeadId(leadId);

  const lead = await prisma.growthLead.findFirst({
    where: { id, ...(opts?.leadType ? { leadType: opts.leadType } : {}) },
    select: { acquisitionStage: true, registrationViewedAt: true },
  });
  if (!lead) return;

  const now = new Date();
  const data: {
    registrationViewedAt?: Date;
    acquisitionStage?: GrowthLeadAcquisitionStage;
  } = {};

  if (!lead.registrationViewedAt) data.registrationViewedAt = now;
  if (stageIndex(lead.acquisitionStage) < stageIndex("CLICKED")) {
    data.acquisitionStage = "CLICKED";
  }

  if (Object.keys(data).length === 0) return;
  await prisma.growthLead.update({ where: { id }, data });
}

/**
 * First genuine form interaction → SIGNUP_STARTED + signupStartedAt once.
 */
export async function stampRegistrationFormStarted(
  prisma: PrismaClient,
  leadId: string,
  opts?: { leadType?: GrowthLeadType },
): Promise<void> {
  if (!isGrowthLeadId(leadId)) return;
  await advanceGrowthLeadAcquisitionStage(prisma, normalizeGrowthLeadId(leadId), "SIGNUP_STARTED", opts);
}

/**
 * Legitimate registration POST receipt — before create attempt.
 * Stamps registrationSubmittedAt once. If form-start was missed (autofill submit),
 * also stamps signupStartedAt / SIGNUP_STARTED so submit implies start.
 */
export async function stampRegistrationSubmitted(
  prisma: PrismaClient,
  leadId: string,
  opts?: { leadType?: GrowthLeadType },
): Promise<void> {
  if (!isGrowthLeadId(leadId)) return;
  const id = normalizeGrowthLeadId(leadId);

  const lead = await prisma.growthLead.findFirst({
    where: { id, ...(opts?.leadType ? { leadType: opts.leadType } : {}) },
    select: {
      acquisitionStage: true,
      registrationSubmittedAt: true,
      signupStartedAt: true,
    },
  });
  if (!lead) return;

  const now = new Date();
  const data: {
    registrationSubmittedAt?: Date;
    signupStartedAt?: Date;
    acquisitionStage?: GrowthLeadAcquisitionStage;
  } = {};

  if (!lead.registrationSubmittedAt) data.registrationSubmittedAt = now;
  if (!lead.signupStartedAt) data.signupStartedAt = now;
  if (stageIndex(lead.acquisitionStage) < stageIndex("SIGNUP_STARTED")) {
    data.acquisitionStage = "SIGNUP_STARTED";
  }

  if (Object.keys(data).length === 0) return;
  await prisma.growthLead.update({ where: { id }, data });
}

export type RegistrationFunnelRole = "venue" | "host" | "performer";

export function leadTypeForRegistrationRole(role: RegistrationFunnelRole): GrowthLeadType {
  switch (role) {
    case "venue":
      return "VENUE";
    case "host":
      return "PROMOTER_ACCOUNT";
    case "performer":
      return "ARTIST";
  }
}
