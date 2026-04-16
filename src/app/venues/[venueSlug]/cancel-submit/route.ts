import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { venueIdsForVenueSession } from "@/lib/authz";
import { requirePrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";
import { appendQueryToPath, safePublicVenueReturnPath } from "@/lib/publicVenueReturnPath";

export const runtime = "nodejs";

function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`${key} is required`);
  return v.trim();
}

function optString(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function redirectTo(path: string) {
  return NextResponse.redirect(absoluteServerRedirectUrl(path));
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/venues");
  }

  const venueSlug = reqString(formData, "venueSlug");
  const returnBase = safePublicVenueReturnPath(venueSlug, optString(formData, "returnPath"));
  const bookingId = reqString(formData, "bookingId");

  const session = await getSession();
  if (!session) {
    return redirectTo(appendQueryToPath(returnBase, { bookError: "Sign in to cancel a booking." }));
  }

  const prisma = requirePrisma();
  const bookingVenueId = await prisma.booking
    .findUnique({
      where: { id: bookingId },
      select: { slot: { select: { instance: { select: { template: { select: { venueId: true } } } } } } },
    })
    .then((b) => b?.slot.instance.template.venueId);

  if (!bookingVenueId) {
    return redirectTo(appendQueryToPath(returnBase, { bookError: "Booking not found." }));
  }

  const allowedVenueIds = await venueIdsForVenueSession(session);

  if (session.kind === "musician") {
    const full = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        musicianId: true,
        slot: { select: { instance: { select: { template: { select: { venue: { select: { slug: true } } } } } } } },
      },
    });
    if (!full || full.slot.instance.template.venue.slug !== venueSlug) {
      return redirectTo(appendQueryToPath(returnBase, { bookError: "Booking not found." }));
    }
    if (!full.musicianId || full.musicianId !== session.musicianId) {
      return redirectTo(appendQueryToPath(returnBase, { bookError: "You can only cancel your own bookings." }));
    }
  } else if (session.kind === "venue") {
    if (!allowedVenueIds.includes(bookingVenueId)) {
      return redirectTo(appendQueryToPath(returnBase, { bookError: "Not allowed to cancel this booking." }));
    }
  } else {
    return redirectTo(appendQueryToPath(returnBase, { bookError: "Sign in to cancel a booking." }));
  }

  const lineupYmd = await prisma.booking
    .findUnique({
      where: { id: bookingId },
      select: { slot: { select: { instance: { select: { date: true } } } } },
    })
    .then((b) => b?.slot.instance.date.toISOString().slice(0, 10));

  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { slot: { include: { instance: { include: { template: { include: { venue: true } } } } } } },
    });
    if (!booking) throw new Error("Booking not found");
    if (booking.slot.instance.template.venue.slug !== venueSlug) throw new Error("Venue mismatch");

    await tx.booking.update({
      where: { id: booking.id },
      data: { cancelledAt: new Date() },
    });

    await tx.slot.update({
      where: { id: booking.slotId },
      data: { status: "AVAILABLE" },
    });
  });

  revalidatePath(`/venues/${venueSlug}`);
  revalidatePath(`/venues/${venueSlug}/lineup`);
  if (lineupYmd) revalidatePath(`/venues/${venueSlug}/lineup/${lineupYmd}`);
  revalidatePath(ARTIST_DASHBOARD_HREF);
  return redirectTo(appendQueryToPath(returnBase, { cancelled: "1" }));
}
