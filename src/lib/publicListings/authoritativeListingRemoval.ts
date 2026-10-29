import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import {
  OPEN_MIC_REMOVAL_REASON,
  removeOpenMicListing,
} from "@/lib/publicListings/openMicSelfRemoval";

export const AUTHORITATIVE_REMOVAL_NOTE = "AUTHORITATIVE_FIRST_PARTY_REMOVAL";

async function suppressContactAndLeads(
  prisma: PrismaClient,
  emails: string[],
  listingIds: string[],
  note: string,
): Promise<{ leads: number; contacts: number }> {
  const normalized = [...new Set(emails.map((e) => normalizeMarketingEmail(e)).filter(Boolean))] as string[];
  let leads = 0;
  let contacts = 0;

  for (const emailNormalized of normalized) {
    await prisma.marketingEmailSuppression.upsert({
      where: { emailNormalized },
      create: { emailNormalized, reason: "ADMIN_SUPPRESS", sourceNote: note },
      update: { reason: "ADMIN_SUPPRESS", sourceNote: note },
    });

    const contactRes = await prisma.marketingContact.updateMany({
      where: { emailNormalized },
      data: {
        status: "DO_NOT_CONTACT",
        suppressedAt: new Date(),
        suppressionReason: "ADMIN_SUPPRESS",
      },
    });
    contacts += contactRes.count;

    const existingLeads = await prisma.growthLead.findMany({
      where: { contactEmailNormalized: emailNormalized },
      select: { id: true, internalNotes: true },
    });
    for (const lead of existingLeads) {
      await prisma.growthLead.update({
        where: { id: lead.id },
        data: {
          status: "UNSUBSCRIBED",
          internalNotes: [lead.internalNotes, note].filter(Boolean).join("\n"),
        },
      });
    }
    const leadRes = { count: existingLeads.length };
    leads += leadRes.count;
  }

  if (listingIds.length > 0) {
    const linked = await prisma.growthLead.updateMany({
      where: { publicListings: { some: { id: { in: listingIds } } } },
      data: { status: "UNSUBSCRIBED" },
    });
    leads += linked.count;

    await prisma.growthLeadFollowUpSchedule.updateMany({
      where: {
        OR: [
          { lead: { publicListings: { some: { id: { in: listingIds } } } } },
          ...(normalized.length > 0
            ? [{ lead: { contactEmailNormalized: { in: normalized } } }]
            : []),
        ],
      },
      data: { enabled: false, status: "CANCELLED" },
    });
  } else if (normalized.length > 0) {
    await prisma.growthLeadFollowUpSchedule.updateMany({
      where: { lead: { contactEmailNormalized: { in: normalized } } },
      data: { enabled: false, status: "CANCELLED" },
    });
  }

  return { leads, contacts };
}

/**
 * Soft-remove a listing after an official first-party correction.
 * Preserves audit/source history. Does not invent or publish a replacement event.
 */
export async function applyAuthoritativeListingRemoval(opts: {
  prisma: PrismaClient;
  listingId: string;
  actorLabel: string;
  contactEmails?: string[];
  note?: string;
}): Promise<
  | {
      ok: true;
      listingId: string;
      listingName: string;
      tokensRevoked: number;
      alreadyRemoved: boolean;
      leadsSuppressed: number;
      contactsSuppressed: number;
    }
  | { ok: false; error: string; status: number }
> {
  const { prisma, listingId } = opts;
  const note = opts.note?.trim() || AUTHORITATIVE_REMOVAL_NOTE;

  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      name: true,
      slug: true,
      removedAt: true,
      verificationStatus: true,
      claimInviteEmail: true,
      growthLead: { select: { contactEmailNormalized: true } },
    },
  });
  if (!listing) return { ok: false, error: "Listing not found.", status: 404 };

  const emails = [
    ...(opts.contactEmails ?? []),
    listing.claimInviteEmail ?? "",
    listing.growthLead?.contactEmailNormalized ?? "",
  ].filter(Boolean);

  let tokensRevoked = 0;
  let alreadyRemoved = false;

  if (listing.removedAt || listing.verificationStatus === "OUTDATED") {
    alreadyRemoved = true;
    await prisma.publicOpenMicSchedule.updateMany({
      where: { listingId: listing.id, isActive: true },
      data: { isActive: false },
    });
  } else {
    const removed = await removeOpenMicListing({
      prisma,
      listingId: listing.id,
      actor: { kind: "support", label: opts.actorLabel },
      reasonCode: OPEN_MIC_REMOVAL_REASON.AUTHORITATIVE_CONTACT,
    });
    if (!removed.ok) return removed;
    tokensRevoked = removed.tokensRevoked;
  }

  const suppressed = await suppressContactAndLeads(prisma, emails, [listing.id], note);

  await prisma.listingCorrection.create({
    data: {
      listingId: listing.id,
      kind: "AUTHORITATIVE_REMOVAL",
      message: note,
      status: "APPLIED",
      reviewedAt: new Date(),
      reviewedByEmail: "support@system",
      reviewNotes: `Actor ${opts.actorLabel}. No replacement published.`,
    },
  });

  return {
    ok: true,
    listingId: listing.id,
    listingName: listing.name,
    tokensRevoked,
    alreadyRemoved,
    leadsSuppressed: suppressed.leads,
    contactsSuppressed: suppressed.contacts,
  };
}

/** Flag for review without unpublishing or inventing replacement data. */
export async function flagListingForReverification(opts: {
  prisma: PrismaClient;
  listingId: string;
  note: string;
  contactEmails?: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const listing = await opts.prisma.publicOpenMicListing.findUnique({
    where: { id: opts.listingId },
    select: {
      id: true,
      removedAt: true,
      verificationStatus: true,
      internalNotes: true,
      claimInviteEmail: true,
      growthLead: { select: { contactEmailNormalized: true } },
    },
  });
  if (!listing) return { ok: false, error: "Listing not found." };
  if (!listing.removedAt && listing.verificationStatus !== "OUTDATED") {
    await opts.prisma.publicOpenMicListing.update({
      where: { id: listing.id },
      data: {
        verificationStatus: "NEEDS_REVIEW",
        internalNotes: [listing.internalNotes, opts.note].filter(Boolean).join("\n"),
      },
    });
  }
  const emails = [
    ...(opts.contactEmails ?? []),
    listing.claimInviteEmail ?? "",
    listing.growthLead?.contactEmailNormalized ?? "",
  ].filter(Boolean);
  await suppressContactAndLeads(opts.prisma, emails, [listing.id], opts.note);
  await opts.prisma.listingCorrection.create({
    data: {
      listingId: listing.id,
      kind: "AUTHORITATIVE_REVERIFY",
      message: opts.note,
      status: "PENDING",
    },
  });
  return { ok: true };
}
