import type { MessageSenderSide, PrismaClient } from "@/generated/prisma/client";
import { assertCanMessagePair } from "@/lib/messaging/eligibility";

const MAX_BODY = 8000;

export function clampMessageBody(raw: string): string {
  const t = raw.trim();
  if (t.length > MAX_BODY) return t.slice(0, MAX_BODY);
  return t;
}

export async function getOrCreateThread(prisma: PrismaClient, venueId: string, musicianId: string) {
  await assertCanMessagePair(prisma, venueId, musicianId);
  return prisma.messageThread.upsert({
    where: { venueId_musicianId: { venueId, musicianId } },
    create: { venueId, musicianId },
    update: {},
  });
}

export async function appendMessage(
  prisma: PrismaClient,
  threadId: string,
  body: string,
  senderSide: MessageSenderSide,
) {
  const text = clampMessageBody(body);
  if (!text) throw new Error("Message cannot be empty.");

  return prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        threadId,
        body: text,
        senderSide,
      },
    });
    await tx.messageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: msg.createdAt },
    });
    return msg;
  });
}

/** Mark thread read for the side that is viewing (updates watermark). */
export async function markThreadRead(
  prisma: PrismaClient,
  threadId: string,
  asSide: "musician" | "venue",
) {
  const now = new Date();
  if (asSide === "musician") {
    await prisma.messageThread.update({
      where: { id: threadId },
      data: { lastReadByMusicianAt: now },
    });
  } else {
    await prisma.messageThread.update({
      where: { id: threadId },
      data: { lastReadByVenueAt: now },
    });
  }
}

/** `messages` should be the latest message only (e.g. `take: 1`, `orderBy: createdAt desc`). */
export function unreadForMusician(thread: {
  lastReadByMusicianAt: Date | null;
  messages: { createdAt: Date; senderSide: MessageSenderSide }[];
}): boolean {
  const last = thread.messages[0];
  if (!last || last.senderSide !== "VENUE") return false;
  const read = thread.lastReadByMusicianAt;
  return !read || last.createdAt > read;
}

export function unreadForVenue(thread: {
  lastReadByVenueAt: Date | null;
  messages: { createdAt: Date; senderSide: MessageSenderSide }[];
}): boolean {
  const last = thread.messages[0];
  if (!last || last.senderSide !== "MUSICIAN") return false;
  const read = thread.lastReadByVenueAt;
  return !read || last.createdAt > read;
}
