"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { bookingBlockReason, slotRestrictionBlockReason } from "@/lib/venueBookingRules";

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

  const slotPreview = await prisma.slot.findUnique({
    where: { id: slotId },
    include: { booking: true, instance: { include: { template: { include: { venue: true } } } } },
  });
  if (!slotPreview) throw new Error("Slot not found");
  if (slotPreview.instance.template.venue.slug !== venueSlug) throw new Error("Venue mismatch");
  const venue = slotPreview.instance.template.venue;
  const instanceBlock = bookingBlockReason(venue, slotPreview.instance.date);
  if (instanceBlock) {
    redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent(instanceBlock)}`);
  }

  const slotStartUtc = new Date(slotPreview.instance.date.getTime() + slotPreview.startMin * 60 * 1000);
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
  );
  if (templateRestrictionBlock) {
    redirect(`/venues/${venueSlug}?bookError=${encodeURIComponent(templateRestrictionBlock)}`);
  }

  await prisma.$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({
      where: { id: slotId },
      include: { booking: true, instance: { include: { template: { include: { venue: true } } } } },
    });
    if (!slot) throw new Error("Slot not found");
    if (slot.instance.template.venue.slug !== venueSlug) throw new Error("Venue mismatch");
    if (slot.status !== "AVAILABLE") throw new Error("Slot is not available");
    if (slot.booking && !slot.booking.cancelledAt) throw new Error("Slot already booked");

    // Re-check restriction in transaction for consistency.
    const txVenue = slot.instance.template.venue;
    const txSlotStartUtc = new Date(slot.instance.date.getTime() + slot.startMin * 60 * 1000);
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
}

export async function cancelBooking(formData: FormData) {
  const venueSlug = reqString(formData, "venueSlug");
  const bookingId = reqString(formData, "bookingId");

  const session = await getSession();

  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { slot: { include: { instance: { include: { template: { include: { venue: true } } } } } } },
    });
    if (!booking) throw new Error("Booking not found");
    if (booking.slot.instance.template.venue.slug !== venueSlug) throw new Error("Venue mismatch");

    // Musicians can only cancel their own booking if tied to their account.
    if (session?.kind === "musician" && booking.musicianId && booking.musicianId !== session.musicianId) {
      throw new Error("Not allowed");
    }

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
}

