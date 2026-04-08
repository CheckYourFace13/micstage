"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MessageSenderSide } from "@/generated/prisma/client";
import { requireVenueSession, venueIdsForSession } from "@/lib/authz";
import { assertCanMessagePair } from "@/lib/messaging/eligibility";
import { notifyNewMessageEmail } from "@/lib/messaging/notifications";
import { appendMessage, getOrCreateThread, markThreadRead } from "@/lib/messaging/service";
import { requirePrisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/publicSeo";
import { storageYmdUtc } from "@/lib/venuePublicLineup";
import { VENUE_DASHBOARD_HREF } from "@/lib/safeRedirect";

function optString(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null || typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Message all artists with MicStage accounts who have an active booking on the selected open mic date for this venue.
 */
export async function messageAllParticipantsForDateAction(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = optString(formData, "venueId");
  const dateYmd = optString(formData, "dateYmd");
  const bodyRaw = optString(formData, "body");
  if (!venueId || !dateYmd || !bodyRaw) redirect(`${VENUE_DASHBOARD_HREF}?bulkMsg=invalid`);

  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect(`${VENUE_DASHBOARD_HREF}?bulkMsg=forbidden`);

  const prisma = requirePrisma();
  const instances = await prisma.eventInstance.findMany({
    where: { template: { venueId }, isCancelled: false },
    include: {
      slots: {
        include: {
          booking: {
            select: { id: true, musicianId: true, cancelledAt: true },
          },
        },
      },
    },
  });

  const matching = instances.filter((i) => storageYmdUtc(i.date) === dateYmd);
  const musicianIds = new Set<string>();
  for (const inst of matching) {
    for (const s of inst.slots) {
      const b = s.booking;
      if (b && !b.cancelledAt && b.musicianId) musicianIds.add(b.musicianId);
    }
  }

  if (musicianIds.size === 0) redirect(`${VENUE_DASHBOARD_HREF}?bulkMsg=norecipients`);

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { name: true },
  });

  let sent = 0;
  const errors: string[] = [];

  for (const musicianId of musicianIds) {
    try {
      await assertCanMessagePair(prisma, venueId, musicianId);
      const thread = await getOrCreateThread(prisma, venueId, musicianId);
      await appendMessage(prisma, thread.id, bodyRaw, MessageSenderSide.VENUE);
      await markThreadRead(prisma, thread.id, "venue");

      const musician = await prisma.musicianUser.findUnique({
        where: { id: musicianId },
        select: { email: true, stageName: true },
      });
      if (musician) {
        void notifyNewMessageEmail({
          to: musician.email,
          recipientLabel: musician.stageName,
          senderLabel: venue?.name ?? "Venue",
          threadUrl: absoluteUrl(`/messages/${thread.id}`),
          preview: bodyRaw,
        });
      }
      sent += 1;
    } catch (e) {
      errors.push(musicianId);
      console.error("[bulkMessage] recipient failed", musicianId, e);
    }
  }

  revalidatePath(VENUE_DASHBOARD_HREF);
  revalidatePath("/messages");
  const q =
    errors.length > 0
      ? `bulkMsg=partial&sent=${sent}&failed=${errors.length}`
      : `bulkMsg=sent&sent=${sent}`;
  redirect(`${VENUE_DASHBOARD_HREF}?${q}`);
}
