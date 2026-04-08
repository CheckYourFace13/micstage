"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MessageSenderSide } from "@/generated/prisma/client";
import {
  requireMusicianSession,
  requireVenueSession,
  venueIdsForSession,
  venueIdsForVenueSession,
} from "@/lib/authz";
import { assertCanMessagePair } from "@/lib/messaging/eligibility";
import { notifyNewMessageEmail } from "@/lib/messaging/notifications";
import { appendMessage, getOrCreateThread, markThreadRead } from "@/lib/messaging/service";
import { requirePrisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/publicSeo";

const MESSAGES_HREF = "/messages";

function optString(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null || typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

async function loadThreadForAuth(threadId: string) {
  const prisma = requirePrisma();
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: {
      venue: { select: { id: true, name: true } },
      musician: { select: { id: true, stageName: true, email: true } },
    },
  });
  return thread;
}

export async function sendReplyAction(formData: FormData) {
  const threadId = optString(formData, "threadId");
  const body = optString(formData, "body");
  if (!threadId || !body) redirect(`${MESSAGES_HREF}?err=invalid`);

  const prisma = requirePrisma();
  const thread = await loadThreadForAuth(threadId);
  if (!thread) redirect(`${MESSAGES_HREF}?err=notfound`);

  const { getSession } = await import("@/lib/session");
  const mSession = await getSession();
  if (!mSession) redirect(`${MESSAGES_HREF}?err=auth`);

  let side: MessageSenderSide;
  if (mSession.kind === "musician") {
    if (mSession.musicianId !== thread.musicianId) redirect(`${MESSAGES_HREF}?err=forbidden`);
    side = MessageSenderSide.MUSICIAN;
  } else if (mSession.kind === "venue") {
    const ids = await venueIdsForVenueSession(mSession);
    if (!ids.includes(thread.venueId)) redirect(`${MESSAGES_HREF}?err=forbidden`);
    side = MessageSenderSide.VENUE;
  } else {
    redirect(`${MESSAGES_HREF}?err=forbidden`);
  }

  try {
    await appendMessage(prisma, threadId, body, side);
  } catch {
    redirect(`${MESSAGES_HREF}/${threadId}?err=send`);
  }

  if (side === MessageSenderSide.MUSICIAN) {
    await markThreadRead(prisma, threadId, "musician");
  } else {
    await markThreadRead(prisma, threadId, "venue");
  }

  const threadUrl = `/messages/${threadId}`;
  if (side === MessageSenderSide.MUSICIAN) {
    const owner = await prisma.venue.findUnique({
      where: { id: thread.venueId },
      select: { owner: { select: { email: true } } },
    });
    const managers = await prisma.venueManagerAccess.findMany({
      where: { venueId: thread.venueId },
      include: { manager: { select: { email: true } } },
    });
    const emails = new Set<string>();
    if (owner?.owner?.email) emails.add(owner.owner.email);
    for (const m of managers) emails.add(m.manager.email);
    for (const to of emails) {
      void notifyNewMessageEmail({
        to,
        recipientLabel: thread.venue.name,
        senderLabel: thread.musician.stageName,
        threadUrl: absoluteUrl(threadUrl),
        preview: body,
      });
    }
  } else {
    void notifyNewMessageEmail({
      to: thread.musician.email,
      recipientLabel: thread.musician.stageName,
      senderLabel: thread.venue.name,
      threadUrl: absoluteUrl(threadUrl),
      preview: body,
    });
  }

  revalidatePath(MESSAGES_HREF);
  revalidatePath(threadUrl);
  redirect(threadUrl);
}

export async function startThreadMusicianAction(formData: FormData) {
  const session = await requireMusicianSession();
  const venueId = optString(formData, "venueId");
  const body = optString(formData, "body");
  if (!venueId || !body) redirect(`${MESSAGES_HREF}/new?err=invalid`);

  const prisma = requirePrisma();
  try {
    await assertCanMessagePair(prisma, venueId, session.musicianId);
  } catch {
    redirect(`${MESSAGES_HREF}/new?err=eligibility`);
  }

  const thread = await getOrCreateThread(prisma, venueId, session.musicianId);
  await appendMessage(prisma, thread.id, body, MessageSenderSide.MUSICIAN);
  await markThreadRead(prisma, thread.id, "musician");

  const threadUrl = `/messages/${thread.id}`;
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { name: true, owner: { select: { email: true } } },
  });
  const managers = await prisma.venueManagerAccess.findMany({
    where: { venueId },
    include: { manager: { select: { email: true } } },
  });
  const musician = await prisma.musicianUser.findUnique({
    where: { id: session.musicianId },
    select: { stageName: true },
  });
  if (venue && musician) {
    const emails = new Set<string>();
    if (venue.owner?.email) emails.add(venue.owner.email);
    for (const m of managers) emails.add(m.manager.email);
    for (const to of emails) {
      void notifyNewMessageEmail({
        to,
        recipientLabel: venue.name,
        senderLabel: musician.stageName,
        threadUrl: absoluteUrl(threadUrl),
        preview: body,
      });
    }
  }

  revalidatePath(MESSAGES_HREF);
  revalidatePath(threadUrl);
  redirect(threadUrl);
}

export async function startThreadVenueAction(formData: FormData) {
  const session = await requireVenueSession();
  const venueId = optString(formData, "venueId");
  const musicianId = optString(formData, "musicianId");
  const body = optString(formData, "body");
  if (!venueId || !musicianId || !body) redirect(`${MESSAGES_HREF}/new?err=invalid`);

  const prisma = requirePrisma();
  const allowed = await venueIdsForSession(session);
  if (!allowed.includes(venueId)) redirect(`${MESSAGES_HREF}/new?err=forbidden`);

  try {
    await assertCanMessagePair(prisma, venueId, musicianId);
  } catch {
    redirect(`${MESSAGES_HREF}/new?err=eligibility`);
  }

  const thread = await getOrCreateThread(prisma, venueId, musicianId);
  await appendMessage(prisma, thread.id, body, MessageSenderSide.VENUE);
  await markThreadRead(prisma, thread.id, "venue");

  const threadUrl = `/messages/${thread.id}`;
  const [venue, musician] = await Promise.all([
    prisma.venue.findUnique({ where: { id: venueId }, select: { name: true } }),
    prisma.musicianUser.findUnique({ where: { id: musicianId }, select: { email: true, stageName: true } }),
  ]);
  if (venue && musician) {
    void notifyNewMessageEmail({
      to: musician.email,
      recipientLabel: musician.stageName,
      senderLabel: venue.name,
      threadUrl: absoluteUrl(threadUrl),
      preview: body,
    });
  }

  revalidatePath(MESSAGES_HREF);
  revalidatePath(threadUrl);
  redirect(threadUrl);
}
