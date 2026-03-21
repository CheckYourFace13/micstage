"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrisma } from "@/lib/prisma";
import { venueIdsForVenueSession } from "@/lib/authz";
import { getSession } from "@/lib/session";
import { bookingBlockReason, slotRestrictionBlockReason, slotStartInstant } from "@/lib/venueBookingRules";

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

function optNumber(formData: FormData, key: string): number | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

export async function bookSlot(formData: FormData) {
  const venueSlug = reqString(formData, "venueSlug");
  const slotId = reqString(formData, "slotId");
  const notes = optString(formData, "notes");

  const clientLat = optNumber(formData, "clientLat");
  const clientLng = optNumber(formData, "clientLng");
  const clientLocation = clientLat != null && clientLng != null ? { lat: clientLat, lng: clientLng } : undefined;

  const session = await getSession();

  const slotPreview = await requirePrisma().slot.findUnique({
    where: { id: slotId },
    include: { booking: true, instance: { include: { template: { include: { venue: true } } } } },
  });
  if (!slotPreview) throw new Error("Slot not found");
  if (slotPreview.instance.template.venue.slug !== venueSlug) throw new Error("Venue mismatch");
  const venue = slotPreview.instance.template.venue;
  if (slotPreview.instance.isCancelled) {
    redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent("This date’s schedule was cancelled.")}`);
  }
  const instanceBlock = bookingBlockReason(venue, slotPreview.instance.date);
  if (instanceBlock) {
    redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent(instanceBlock)}`);
  }

  const previewTz = slotPreview.instance.template.timeZone;
  const slotStartUtc = slotStartInstant(slotPreview.instance.date, slotPreview.startMin, previewTz);
  const templateRestrictionBlock = slotRestrictionBlockReason(
    {
      bookingRestrictionMode: slotPreview.instance.template.bookingRestrictionMode,
      restrictionHoursBefore: slotPreview.instance.template.restrictionHoursBefore,
      onPremiseMaxDistanceMeters: slotPreview.instance.template.onPremiseMaxDistanceMeters,
      lat: venue.lat,
      lng: venue.lng,
    },
    slotStartUtc,
    new Date(),
    clientLocation,
    { restrictionTimeZone: previewTz },
  );
  if (templateRestrictionBlock) {
    redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent(templateRestrictionBlock)}`);
  }

  await requirePrisma().$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({
      where: { id: slotId },
      include: { booking: true, instance: { include: { template: { include: { venue: true } } } } },
    });
    if (!slot) throw new Error("Slot not found");
    if (slot.instance.template.venue.slug !== venueSlug) throw new Error("Venue mismatch");
    if (slot.instance.isCancelled) {
      redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent("This date’s schedule was cancelled.")}`);
    }
    if (slot.status !== "AVAILABLE") throw new Error("Slot is not available");
    if (slot.booking && !slot.booking.cancelledAt) throw new Error("Slot already booked");

    // Re-check restriction in transaction for consistency.
    const txVenue = slot.instance.template.venue;
    const txTz = slot.instance.template.timeZone;
    const txSlotStartUtc = slotStartInstant(slot.instance.date, slot.startMin, txTz);
    const txInstanceBlock = bookingBlockReason(txVenue, slot.instance.date);
    if (txInstanceBlock) redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent(txInstanceBlock)}`);
    const txRestrictionBlock = slotRestrictionBlockReason(
      {
        bookingRestrictionMode: slot.instance.template.bookingRestrictionMode,
        restrictionHoursBefore: slot.instance.template.restrictionHoursBefore,
        onPremiseMaxDistanceMeters: slot.instance.template.onPremiseMaxDistanceMeters,
        lat: txVenue.lat,
        lng: txVenue.lng,
      },
      txSlotStartUtc,
      new Date(),
      clientLocation,
      { restrictionTimeZone: txTz },
    );
    if (txRestrictionBlock) redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent(txRestrictionBlock)}`);

    let performerName = optString(formData, "performerName") ?? "";
    let performerEmail = optString(formData, "performerEmail") ?? null;
    let musicianId: string | null = null;

    if (session?.kind === "musician") {
      const user = await tx.musicianUser.findUnique({ where: { id: session.musicianId } });
      if (user) {
        performerName = user.stageName;
        performerEmail = user.email;
        musicianId = user.id;
      }
    } else if (!performerName.trim()) {
      throw new Error("Name is required");
    }

    await tx.booking.create({
      data: {
        slotId: slot.id,
        musicianId,
        performerName,
        performerEmail,
        notes: notes ?? null,
      },
    });

    await tx.slot.update({
      where: { id: slot.id },
      data: { status: "RESERVED" },
    });
  });

  revalidatePath(`/venues/${venueSlug}`);
  revalidatePath("/artist");
  redirect(`/venues/${venueSlug}?booked=1`);
}

export async function cancelBooking(formData: FormData) {
  const venueSlug = reqString(formData, "venueSlug");
  const bookingId = reqString(formData, "bookingId");

  const session = await getSession();
  if (!session) {
    redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent("Sign in to cancel a booking.")}`);
  }

  const bookingVenueId = await requirePrisma().booking
    .findUnique({
      where: { id: bookingId },
      select: { slot: { select: { instance: { select: { template: { select: { venueId: true } } } } } } },
    })
    .then((b) => b?.slot.instance.template.venueId);

  if (!bookingVenueId) {
    redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent("Booking not found.")}`);
  }

  const allowedVenueIds = await venueIdsForVenueSession(session);

  if (session.kind === "musician") {
    const full = await requirePrisma().booking.findUnique({
      where: { id: bookingId },
      select: { musicianId: true, slot: { select: { instance: { select: { template: { select: { venue: { select: { slug: true } } } } } } } } },
    });
    if (!full || full.slot.instance.template.venue.slug !== venueSlug) {
      redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent("Booking not found.")}`);
    }
    if (!full.musicianId || full.musicianId !== session.musicianId) {
      redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent("You can only cancel your own bookings.")}`);
    }
  } else if (session.kind === "venue") {
    if (!allowedVenueIds.includes(bookingVenueId)) {
      redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent("Not allowed to cancel this booking.")}`);
    }
  } else {
    redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent("Sign in to cancel a booking.")}`);
  }

  await requirePrisma().$transaction(async (tx) => {
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
  revalidatePath("/artist");
  redirect(`/venues/${venueSlug}?cancelled=1`);
}

