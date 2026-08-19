/**
 * Host vs venue acquisition funnel metrics for the owner daily summary.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { HOST_SECOND_VENUE_EVENT } from "@/lib/host/hostSecondVenueActivation";
import { HOST_MULTI_VENUE_PROSPECT } from "@/lib/growth/hostMultiVenueProspect";

export type HostAcquisitionMetrics = {
  prospectsFound: number;
  multiVenueProspects: number;
  prospectsHighContact: number;
  prospectsHostLane: number;
  outreachReady: number;
  emailsSent24h: number;
  delivered24h: number;
  clicks24h: number;
  registrations24h: number;
  firstSeries24h: number;
  firstNight24h: number;
  secondVenueActivations24h: number;
  emailsSent7d: number;
  delivered7d: number;
  clicks7d: number;
  registrations7d: number;
  firstSeries7d: number;
  firstNight7d: number;
  secondVenueActivations7d: number;
  emailsSent30d: number;
  delivered30d: number;
  clicks30d: number;
  registrations30d: number;
  secondVenueActivationsTotal: number;
};

export type VenueAcquisitionMetrics = {
  prospectsVerified: number;
  emailsSent24h: number;
  delivered24h: number;
  clicks24h: number;
  claims24h: number;
  registrations24h: number;
  emailsSent7d: number;
  delivered7d: number;
  clicks7d: number;
  claims7d: number;
  registrations7d: number;
};

function hostLaneWhere() {
  return {
    leadType: "PROMOTER_ACCOUNT" as const,
    OR: [
      { source: "host_evidence_extraction" },
      { discoveryHints: { string_contains: "hostOutreachLane" } },
    ],
  };
}

export async function loadHostAcquisitionMetrics(
  prisma: PrismaClient,
  startUtc: Date,
  endUtc: Date,
  sevenDayStart: Date,
  thirtyDayStart?: Date,
): Promise<HostAcquisitionMetrics> {
  const t30 = thirtyDayStart ?? new Date(startUtc.getTime() - 30 * 86400000);
  const [
    prospectsFound,
    multiVenueProspects,
    prospectsHighContact,
    prospectsHostLane,
    outreachReady,
    hostSends24h,
    hostDelivered24h,
    hostClicks24h,
    hostRegs24h,
    firstSeries24h,
    firstNight24h,
    secondVenue24h,
    hostSends7d,
    hostDelivered7d,
    hostClicks7d,
    hostRegs7d,
    firstSeries7d,
    firstNight7d,
    secondVenue7d,
    secondVenueTotal,
    hostSends30d,
    hostDelivered30d,
    hostClicks30d,
    hostRegs30d,
  ] = await Promise.all([
    prisma.growthLead.count({ where: { leadType: "PROMOTER_ACCOUNT" } }),
    prisma.growthLead.count({
      where: {
        OR: [
          { discoveryHints: { string_contains: "hostMultiVenueProspect" } },
          { discoveryHints: { string_contains: HOST_MULTI_VENUE_PROSPECT } },
        ],
      },
    }),
    prisma.growthLead.count({
      where: { leadType: "PROMOTER_ACCOUNT", contactEmailConfidence: "HIGH" },
    }),
    prisma.growthLead.count({ where: hostLaneWhere() }),
    prisma.growthLead.count({
      where: {
        leadType: "PROMOTER_ACCOUNT",
        contactEmailConfidence: "HIGH",
        contactEmailNormalized: { not: null },
        status: { notIn: ["JOINED", "REJECTED", "UNSUBSCRIBED", "BOUNCED"] },
      },
    }),
    prisma.marketingEmailSend.count({
      where: {
        category: "OUTREACH",
        status: "SENT",
        sentAt: { gte: startUtc, lt: endUtc },
        growthLeadOutreachDraft: { lead: { leadType: "PROMOTER_ACCOUNT" } },
      },
    }),
    prisma.marketingEmailSend.count({
      where: {
        category: "OUTREACH",
        deliveredAt: { gte: startUtc, lt: endUtc },
        growthLeadOutreachDraft: { lead: { leadType: "PROMOTER_ACCOUNT" } },
      },
    }),
    prisma.marketingOutreachClick.count({
      where: {
        createdAt: { gte: startUtc, lt: endUtc },
        send: { growthLeadOutreachDraft: { lead: { leadType: "PROMOTER_ACCOUNT" } } },
      },
    }),
    prisma.promoterUser.count({ where: { createdAt: { gte: startUtc, lt: endUtc } } }),
    prisma.promoterSeries.count({ where: { createdAt: { gte: startUtc, lt: endUtc } } }),
    prisma.promoterNight.count({ where: { createdAt: { gte: startUtc, lt: endUtc } } }),
    prisma.marketingEvent.count({
      where: {
        type: "INTERNAL_AUDIT",
        createdAt: { gte: startUtc, lt: endUtc },
        payload: { path: ["event"], equals: HOST_SECOND_VENUE_EVENT },
      },
    }),
    prisma.marketingEmailSend.count({
      where: {
        category: "OUTREACH",
        status: "SENT",
        sentAt: { gte: sevenDayStart, lt: endUtc },
        growthLeadOutreachDraft: { lead: { leadType: "PROMOTER_ACCOUNT" } },
      },
    }),
    prisma.marketingEmailSend.count({
      where: {
        category: "OUTREACH",
        deliveredAt: { gte: sevenDayStart, lt: endUtc },
        growthLeadOutreachDraft: { lead: { leadType: "PROMOTER_ACCOUNT" } },
      },
    }),
    prisma.marketingOutreachClick.count({
      where: {
        createdAt: { gte: sevenDayStart, lt: endUtc },
        send: { growthLeadOutreachDraft: { lead: { leadType: "PROMOTER_ACCOUNT" } } },
      },
    }),
    prisma.promoterUser.count({ where: { createdAt: { gte: sevenDayStart, lt: endUtc } } }),
    prisma.promoterSeries.count({ where: { createdAt: { gte: sevenDayStart, lt: endUtc } } }),
    prisma.promoterNight.count({ where: { createdAt: { gte: sevenDayStart, lt: endUtc } } }),
    prisma.marketingEvent.count({
      where: {
        type: "INTERNAL_AUDIT",
        createdAt: { gte: sevenDayStart, lt: endUtc },
        payload: { path: ["event"], equals: HOST_SECOND_VENUE_EVENT },
      },
    }),
    prisma.marketingEvent.count({
      where: {
        type: "INTERNAL_AUDIT",
        payload: { path: ["event"], equals: HOST_SECOND_VENUE_EVENT },
      },
    }),
    prisma.marketingEmailSend.count({
      where: {
        category: "OUTREACH",
        status: "SENT",
        sentAt: { gte: t30, lt: endUtc },
        growthLeadOutreachDraft: { lead: { leadType: "PROMOTER_ACCOUNT" } },
      },
    }),
    prisma.marketingEmailSend.count({
      where: {
        category: "OUTREACH",
        deliveredAt: { gte: t30, lt: endUtc },
        growthLeadOutreachDraft: { lead: { leadType: "PROMOTER_ACCOUNT" } },
      },
    }),
    prisma.marketingOutreachClick.count({
      where: {
        createdAt: { gte: t30, lt: endUtc },
        send: { growthLeadOutreachDraft: { lead: { leadType: "PROMOTER_ACCOUNT" } } },
      },
    }),
    prisma.promoterUser.count({ where: { createdAt: { gte: t30, lt: endUtc } } }),
  ]);

  return {
    prospectsFound,
    multiVenueProspects,
    prospectsHighContact,
    prospectsHostLane,
    outreachReady,
    emailsSent24h: hostSends24h,
    delivered24h: hostDelivered24h,
    clicks24h: hostClicks24h,
    registrations24h: hostRegs24h,
    firstSeries24h,
    firstNight24h,
    secondVenueActivations24h: secondVenue24h,
    emailsSent7d: hostSends7d,
    delivered7d: hostDelivered7d,
    clicks7d: hostClicks7d,
    registrations7d: hostRegs7d,
    firstSeries7d,
    firstNight7d,
    secondVenueActivations7d: secondVenue7d,
    emailsSent30d: hostSends30d,
    delivered30d: hostDelivered30d,
    clicks30d: hostClicks30d,
    registrations30d: hostRegs30d,
    secondVenueActivationsTotal: secondVenueTotal,
  };
}

export async function loadVenueAcquisitionMetrics(
  prisma: PrismaClient,
  startUtc: Date,
  endUtc: Date,
  sevenDayStart: Date,
): Promise<VenueAcquisitionMetrics> {
  const [
    prospectsVerified,
    venueSends24h,
    venueDelivered24h,
    venueClicks24h,
    claims24h,
    venueRegs24h,
    venueSends7d,
    venueDelivered7d,
    venueClicks7d,
    claims7d,
    venueRegs7d,
  ] = await Promise.all([
    prisma.growthLead.count({
      where: {
        leadType: "VENUE",
        openMicSignalTier: { in: ["EXPLICIT_OPEN_MIC", "STRONG_LIVE_EVENT"] },
        contactEmailConfidence: "HIGH",
      },
    }),
    prisma.marketingEmailSend.count({
      where: {
        category: "OUTREACH",
        status: "SENT",
        sentAt: { gte: startUtc, lt: endUtc },
        growthLeadOutreachDraft: { lead: { leadType: "VENUE" } },
      },
    }),
    prisma.marketingEmailSend.count({
      where: {
        category: "OUTREACH",
        deliveredAt: { gte: startUtc, lt: endUtc },
        growthLeadOutreachDraft: { lead: { leadType: "VENUE" } },
      },
    }),
    prisma.marketingOutreachClick.count({
      where: {
        createdAt: { gte: startUtc, lt: endUtc },
        send: { growthLeadOutreachDraft: { lead: { leadType: "VENUE" } } },
      },
    }),
    prisma.growthLead.count({
      where: { status: "JOINED", leadType: "VENUE", updatedAt: { gte: startUtc, lt: endUtc } },
    }),
    prisma.venueOwner.count({ where: { createdAt: { gte: startUtc, lt: endUtc } } }),
    prisma.marketingEmailSend.count({
      where: {
        category: "OUTREACH",
        status: "SENT",
        sentAt: { gte: sevenDayStart, lt: endUtc },
        growthLeadOutreachDraft: { lead: { leadType: "VENUE" } },
      },
    }),
    prisma.marketingEmailSend.count({
      where: {
        category: "OUTREACH",
        deliveredAt: { gte: sevenDayStart, lt: endUtc },
        growthLeadOutreachDraft: { lead: { leadType: "VENUE" } },
      },
    }),
    prisma.marketingOutreachClick.count({
      where: {
        createdAt: { gte: sevenDayStart, lt: endUtc },
        send: { growthLeadOutreachDraft: { lead: { leadType: "VENUE" } } },
      },
    }),
    prisma.growthLead.count({
      where: { status: "JOINED", leadType: "VENUE", updatedAt: { gte: sevenDayStart, lt: endUtc } },
    }),
    prisma.venueOwner.count({ where: { createdAt: { gte: sevenDayStart, lt: endUtc } } }),
  ]);

  return {
    prospectsVerified,
    emailsSent24h: venueSends24h,
    delivered24h: venueDelivered24h,
    clicks24h: venueClicks24h,
    claims24h,
    registrations24h: venueRegs24h,
    emailsSent7d: venueSends7d,
    delivered7d: venueDelivered7d,
    clicks7d: venueClicks7d,
    claims7d,
    registrations7d: venueRegs7d,
  };
}
