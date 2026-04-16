import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { MessageSenderSide } from "@/generated/prisma/client";
import { venueIdsForVenueSession } from "@/lib/authz";
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
  if (!session || session.kind !== "venue") {
    return redirectTo("/login/venue?next=%2Fmessages%2Fnew");
  }

  const venueId = optString(formData, "venueId");
  const musicianId = optString(formData, "musicianId");
  const body = optString(formData, "body");
  if (!venueId || !musicianId || !body) return redirectTo(`${MESSAGES_HREF}/new?err=invalid`);

  const prisma = requirePrisma();
  const allowedVenueIds = await venueIdsForVenueSession(session);
  if (!allowedVenueIds.includes(venueId)) return redirectTo(`${MESSAGES_HREF}/new?err=forbidden`);

  try {
    await assertCanMessagePair(prisma, venueId, musicianId);
  } catch {
    return redirectTo(`${MESSAGES_HREF}/new?err=eligibility`);
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
  return redirectTo(threadUrl);
}
