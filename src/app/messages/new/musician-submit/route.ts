import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { MessageSenderSide } from "@/generated/prisma/client";
import { assertCanMessagePair } from "@/lib/messaging/eligibility";
import { notifyNewMessageEmail } from "@/lib/messaging/notifications";
import { appendMessage, getOrCreateThread, markThreadRead } from "@/lib/messaging/service";
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

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo(`${MESSAGES_HREF}/new?err=invalid`);
  }

  const session = await getSession();
  if (!session || session.kind !== "musician") {
    return redirectTo("/login/musician?next=%2Fmessages%2Fnew");
  }

  const venueId = optString(formData, "venueId");
  const body = optString(formData, "body");
  if (!venueId || !body) return redirectTo(`${MESSAGES_HREF}/new?err=invalid`);

  const prisma = requirePrisma();
  try {
    await assertCanMessagePair(prisma, venueId, session.musicianId);
  } catch {
    return redirectTo(`${MESSAGES_HREF}/new?err=eligibility`);
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
  return redirectTo(threadUrl);
}
