import type { PrismaClient } from "@/generated/prisma/client";
import { chicagoLast24hWindow } from "@/lib/ownerSummary/chicagoWindow";

export type OwnerSummarySignupRow = {
  kind: "venue" | "artist";
  name: string;
  email: string;
  cityState: string | null;
  verifiedNote: string;
  createdAt: Date;
};

export type OwnerSummaryLeadHighlight = {
  id: string;
  priorityTag: "signup" | "clicked_no_join" | "replied" | "high_value_not_contacted";
  title: string;
  detail: string;
};

export type OwnerDailySummaryData = {
  windowLabel: string;
  reportChicagoDate: string;
  /** Rolling 24h */
  signups: OwnerSummarySignupRow[];
  signupVenueCount: number;
  signupArtistCount: number;
  leadsCreatedCount: number;
  outreachEmailsSentCount: number;
  uniqueClickLeadsCount: number;
  clicksNote: string;
  growthRepliesCount: number;
  repliesNote: string;
  topItems: OwnerSummaryLeadHighlight[];
};

function cityState(city: string | null | undefined, region: string | null | undefined): string | null {
  const c = city?.trim();
  const r = region?.trim();
  if (c && r) return `${c}, ${r}`;
  return c || r || null;
}

function termsNote(consentAt: Date | null | undefined): string {
  if (consentAt) return "Terms accepted";
  return "Not tracked";
}

/**
 * Aggregates MicStage metrics for the owner daily email. Safe when optional signals are missing.
 */
export async function buildOwnerDailySummary(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<OwnerDailySummaryData> {
  const { startUtc, endUtc, reportChicagoDate, reportLabel } = chicagoLast24hWindow(now);

  const [venueOwners, musicians, leadsCreated, outreachSends, clickLeads, responses] = await Promise.all([
    prisma.venueOwner.findMany({
      where: { createdAt: { gte: startUtc, lt: endUtc } },
      select: {
        id: true,
        email: true,
        createdAt: true,
        registrationContentConsentAt: true,
        venues: { take: 1, select: { name: true, city: true, region: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.musicianUser.findMany({
      where: { createdAt: { gte: startUtc, lt: endUtc } },
      select: {
        id: true,
        email: true,
        stageName: true,
        createdAt: true,
        registrationContentConsentAt: true,
        homeCity: true,
        homeRegion: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.growthLead.count({
      where: { createdAt: { gte: startUtc, lt: endUtc } },
    }),
    prisma.marketingEmailSend.count({
      where: {
        status: "SENT",
        category: "OUTREACH",
        sentAt: { gte: startUtc, lt: endUtc },
      },
    }),
    prisma.growthLead.findMany({
      where: {
        acquisitionStage: "CLICKED",
        status: { not: "JOINED" },
        updatedAt: { gte: startUtc, lt: endUtc },
      },
      select: { id: true },
    }),
    prisma.growthLeadResponse.count({
      where: { createdAt: { gte: startUtc, lt: endUtc } },
    }),
  ]);

  const signups: OwnerSummarySignupRow[] = [];

  for (const o of venueOwners) {
    const v = o.venues[0];
    signups.push({
      kind: "venue",
      name: v?.name?.trim() || "Venue (pending name)",
      email: o.email,
      cityState: cityState(v?.city, v?.region),
      verifiedNote: termsNote(o.registrationContentConsentAt),
      createdAt: o.createdAt,
    });
  }
  for (const m of musicians) {
    signups.push({
      kind: "artist",
      name: m.stageName?.trim() || "Artist",
      email: m.email,
      cityState: cityState(m.homeCity, m.homeRegion),
      verifiedNote: termsNote(m.registrationContentConsentAt),
      createdAt: m.createdAt,
    });
  }
  signups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const uniqueClickLeadsCount = new Set(clickLeads.map((r) => r.id)).size;
  const clicksNote =
    "Proxy: growth leads moved to CLICKED (stage update in window) — dedicated link tracking not stored yet.";

  const repliesNote = "Growth pipeline responses logged in the last 24h (email + admin notes).";

  const [clickedLeadsDetail, repliedLeads, highValueCold] = await Promise.all([
    prisma.growthLead.findMany({
      where: {
        acquisitionStage: "CLICKED",
        status: { not: "JOINED" },
        updatedAt: { gte: startUtc, lt: endUtc },
      },
      select: {
        id: true,
        name: true,
        leadType: true,
        contactEmailNormalized: true,
        city: true,
        region: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
    prisma.growthLead.findMany({
      where: {
        OR: [
          {
            responses: {
              some: { createdAt: { gte: startUtc, lt: endUtc } },
            },
          },
          { status: "REPLIED", updatedAt: { gte: startUtc, lt: endUtc } },
        ],
      },
      select: {
        id: true,
        name: true,
        leadType: true,
        contactEmailNormalized: true,
        city: true,
        region: true,
        status: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
    prisma.growthLead.findMany({
      where: {
        status: { in: ["DISCOVERED", "REVIEWED", "APPROVED"] },
        contactEmailNormalized: { not: null },
      },
      select: {
        id: true,
        name: true,
        leadType: true,
        contactEmailNormalized: true,
        city: true,
        region: true,
        fitScore: true,
        status: true,
      },
      orderBy: [{ fitScore: "desc" }, { createdAt: "desc" }],
      take: 15,
    }),
  ]);

  const topItems: OwnerSummaryLeadHighlight[] = [];
  const seenLeadIds = new Set<string>();
  const seenSignupEmails = new Set<string>();

  const push = (h: OwnerSummaryLeadHighlight) => {
    topItems.push(h);
  };

  for (const s of signups) {
    if (topItems.length >= 20) break;
    const ek = s.email.toLowerCase();
    if (seenSignupEmails.has(ek)) continue;
    seenSignupEmails.add(ek);
    push({
      id: `signup:${ek}`,
      priorityTag: "signup",
      title: `New ${s.kind}: ${s.name}`,
      detail: `${s.email}${s.cityState ? ` · ${s.cityState}` : ""} · ${s.verifiedNote}`,
    });
  }

  for (const l of clickedLeadsDetail) {
    if (topItems.length >= 20) break;
    if (seenLeadIds.has(l.id)) continue;
    seenLeadIds.add(l.id);
    push({
      id: l.id,
      priorityTag: "clicked_no_join",
      title: `Clicked, not joined: ${l.name}`,
      detail: `${l.leadType} · ${l.contactEmailNormalized ?? "no email"} · ${l.status} · ${cityState(l.city, l.region) ?? "—"}`,
    });
  }

  for (const l of repliedLeads) {
    if (topItems.length >= 20) break;
    if (seenLeadIds.has(l.id)) continue;
    seenLeadIds.add(l.id);
    push({
      id: l.id,
      priorityTag: "replied",
      title: `Replied / hot: ${l.name}`,
      detail: `${l.leadType} · ${l.contactEmailNormalized ?? "—"} · status ${l.status}`,
    });
  }

  for (const l of highValueCold) {
    if (topItems.length >= 20) break;
    if (seenLeadIds.has(l.id)) continue;
    seenLeadIds.add(l.id);
    push({
      id: l.id,
      priorityTag: "high_value_not_contacted",
      title: `Lead ready: ${l.name}`,
      detail: `${l.leadType} · ${l.contactEmailNormalized ?? "—"} · fit ${l.fitScore ?? "—"} · ${l.status}`,
    });
  }

  return {
    windowLabel: `${reportLabel} (America/Chicago, last 24h through end of window)`,
    reportChicagoDate,
    signups,
    signupVenueCount: venueOwners.length,
    signupArtistCount: musicians.length,
    leadsCreatedCount: leadsCreated,
    outreachEmailsSentCount: outreachSends,
    uniqueClickLeadsCount,
    clicksNote,
    growthRepliesCount: responses,
    repliesNote,
    topItems: topItems.slice(0, 20),
  };
}
