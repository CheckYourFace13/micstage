import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { MessageSenderSide } from "@/generated/prisma/client";
import { venueIdsForVenueSession } from "@/lib/authz";
import { notifyNewMessageEmail } from "@/lib/messaging/notifications";
import { appendMessage, markThreadRead } from "@/lib/messaging/service";
import { requirePrisma } from "@/lib/prisma";
import { absoluteServerRedirectUrl, absoluteUrl } from "@/lib/publicSeo";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const MESSAGES_HREF = "/messages";

function optString(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null || typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function redirectTo(path: string) {
  return NextResponse.redirect(absoluteServerRedirectUrl(path));
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

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo(`${MESSAGES_HREF}?err=invalid`);
  }

  const threadId = optString(formData, "threadId");
  const body = optString(formData, "body");
  if (!threadId || !body) return redirectTo(`${MESSAGES_HREF}?err=invalid`);

  const prisma = requirePrisma();
  const thread = await loadThreadForAuth(threadId);
  if (!thread) return redirectTo(`${MESSAGES_HREF}?err=notfound`);

  const session = await getSession();
  if (!session) return redirectTo(`${MESSAGES_HREF}?err=auth`);

  let side: MessageSenderSide;
  if (session.kind === "musician") {
    if (session.musicianId !== thread.musicianId) return redirectTo(`${MESSAGES_HREF}?err=forbidden`);
    side = MessageSenderSide.MUSICIAN;
  } else if (session.kind === "venue") {
    const ids = await venueIdsForVenueSession(session);
    if (!ids.includes(thread.venueId)) return redirectTo(`${MESSAGES_HREF}?err=forbidden`);
    side = MessageSenderSide.VENUE;
  } else {
    return redirectTo(`${MESSAGES_HREF}?err=forbidden`);
  }

  try {
    await appendMessage(prisma, threadId, body, side);
  } catch {
    return redirectTo(`${MESSAGES_HREF}/${threadId}?err=send`);
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
  return redirectTo(threadUrl);
}
