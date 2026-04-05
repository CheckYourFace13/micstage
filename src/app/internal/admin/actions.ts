"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  BookingRestrictionMode,
  PasswordResetAccountType,
  SlotStatus,
} from "@/generated/prisma/client";
import { ADMIN_PATH_PREFIX } from "@/lib/adminEdge";
import { assertAdminSession } from "@/lib/adminAuth";
import { revalidateVenueSlugAndAdminLists } from "@/lib/adminRevalidateVenue";
import { requirePrisma } from "@/lib/prisma";
import {
  createPasswordResetLinkForAdmin,
  sendPasswordResetEmailForAdmin,
} from "@/lib/passwordReset";

function sanitizeAdminReturnPath(raw: unknown): string {
  if (typeof raw !== "string") return ADMIN_PATH_PREFIX;
  const p = raw.trim();
  if (!p.startsWith(ADMIN_PATH_PREFIX) || p.includes("//") || p.includes("\\")) {
    return ADMIN_PATH_PREFIX;
  }
  return p;
}

export async function adminUpdateVenue(formData: FormData) {
  await assertAdminSession();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const timeZone = String(formData.get("timeZone") ?? "").trim();
  const aboutRaw = formData.get("about");
  const about = typeof aboutRaw === "string" ? aboutRaw.trim() || null : null;
  if (!id) redirect("/internal/admin/venues?error=missing_id");
  if (!name || !timeZone) {
    redirect(
      `/internal/admin/venues/${id}?error=${encodeURIComponent("Name and timezone required.")}`,
    );
  }

  const prisma = requirePrisma();
  await prisma.venue.update({
    where: { id },
    data: { name, timeZone, about },
  });
  revalidatePath("/internal/admin/venues");
  revalidatePath(`/internal/admin/venues/${id}`);
  redirect(`/internal/admin/venues/${id}?saved=1`);
}

export async function adminUpdateMusician(formData: FormData) {
  await assertAdminSession();
  const id = String(formData.get("id") ?? "");
  const stageName = String(formData.get("stageName") ?? "").trim();
  const bioRaw = formData.get("bio");
  const bio = typeof bioRaw === "string" ? bioRaw.trim() || null : null;
  if (!id) redirect("/internal/admin/artists?error=missing_id");
  if (!stageName) {
    redirect(`/internal/admin/artists/${id}?error=${encodeURIComponent("Stage name required.")}`);
  }

  const prisma = requirePrisma();
  await prisma.musicianUser.update({
    where: { id },
    data: { stageName, bio },
  });
  revalidatePath("/internal/admin/artists");
  revalidatePath(`/internal/admin/artists/${id}`);
  redirect(`/internal/admin/artists/${id}?saved=1`);
}

export async function adminUpdateBooking(formData: FormData) {
  await assertAdminSession();
  const id = String(formData.get("id") ?? "");
  const performerName = String(formData.get("performerName") ?? "").trim();
  const performerEmailRaw = formData.get("performerEmail");
  const performerEmail =
    typeof performerEmailRaw === "string" && performerEmailRaw.trim()
      ? performerEmailRaw.trim()
      : null;
  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim() || null : null;
  if (!id) redirect("/internal/admin/bookings?error=missing_id");
  if (!performerName) {
    redirect(`/internal/admin/bookings/${id}?error=${encodeURIComponent("Performer name required.")}`);
  }

  const bookingCancelled =
    formData.get("bookingCancelled") === "on" || formData.get("bookingCancelled") === "true";
  const musicianIdRaw = String(formData.get("musicianId") ?? "").trim();

  const prisma = requirePrisma();
  const existing = await prisma.booking.findUnique({
    where: { id },
    include: { slot: { include: { instance: { include: { template: { include: { venue: true } } } } } } },
  });
  if (!existing) redirect("/internal/admin/bookings?error=missing_id");

  let musicianId: string | null = existing.musicianId;
  if (musicianIdRaw === "") {
    musicianId = null;
  } else if (musicianIdRaw !== existing.musicianId) {
    const m = await prisma.musicianUser.findUnique({ where: { id: musicianIdRaw }, select: { id: true } });
    if (!m) {
      redirect(`/internal/admin/bookings/${id}?error=${encodeURIComponent("Artist ID not found.")}`);
    }
    musicianId = musicianIdRaw;
  }

  await prisma.booking.update({
    where: { id },
    data: {
      performerName,
      performerEmail,
      notes,
      musicianId,
      cancelledAt: bookingCancelled ? (existing.cancelledAt ?? new Date()) : null,
    },
  });
  revalidatePath("/internal/admin/bookings");
  revalidatePath(`/internal/admin/bookings/${id}`);
  revalidateVenueSlugAndAdminLists(existing.slot.instance.template.venue.slug);
  redirect(`/internal/admin/bookings/${id}?saved=1`);
}

export async function adminUpdateEventTemplate(formData: FormData) {
  await assertAdminSession();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const descriptionRaw = formData.get("description");
  const description = typeof descriptionRaw === "string" ? descriptionRaw.trim() || null : null;
  const isPublic = formData.get("isPublic") === "on" || formData.get("isPublic") === "true";
  if (!id) redirect("/internal/admin/templates?error=missing_id");
  if (!title) {
    redirect(`/internal/admin/templates/${id}?error=${encodeURIComponent("Title required.")}`);
  }

  const prisma = requirePrisma();
  await prisma.eventTemplate.update({
    where: { id },
    data: { title, description, isPublic },
  });
  revalidatePath("/internal/admin/templates");
  revalidatePath(`/internal/admin/templates/${id}`);
  redirect(`/internal/admin/templates/${id}?saved=1`);
}

function parseTimeMinOverrideField(
  formData: FormData,
  key: string,
): { ok: true; value: number | null } | { ok: false } {
  const raw = formData.get(key);
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "") return { ok: true, value: null };
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0 || n > 24 * 60) return { ok: false };
  return { ok: true, value: n };
}

export async function adminUpdateEventInstance(formData: FormData) {
  await assertAdminSession();
  const id = String(formData.get("id") ?? "");
  const isCancelled = formData.get("isCancelled") === "on" || formData.get("isCancelled") === "true";
  if (!id) redirect("/internal/admin/events?error=missing_id");

  const startP = parseTimeMinOverrideField(formData, "startTimeMinOverride");
  const endP = parseTimeMinOverrideField(formData, "endTimeMinOverride");
  if (!startP.ok || !endP.ok) {
    redirect(`/internal/admin/events/${id}?error=${encodeURIComponent("Invalid time override (use 0–1440 minutes).")}`);
  }
  if (
    startP.value != null &&
    endP.value != null &&
    startP.value >= endP.value
  ) {
    redirect(
      `/internal/admin/events/${id}?error=${encodeURIComponent("Start override must be before end override when both are set.")}`,
    );
  }

  const prisma = requirePrisma();
  const inst = await prisma.eventInstance.findUnique({
    where: { id },
    include: { template: { include: { venue: true } } },
  });
  if (!inst) redirect("/internal/admin/events?error=missing_id");

  await prisma.eventInstance.update({
    where: { id },
    data: {
      isCancelled,
      startTimeMinOverride: startP.value,
      endTimeMinOverride: endP.value,
    },
  });
  revalidatePath("/internal/admin/events");
  revalidatePath(`/internal/admin/events/${id}`);
  revalidateVenueSlugAndAdminLists(inst.template.venue.slug);
  redirect(`/internal/admin/events/${id}?saved=1`);
}

const BOOKING_RESTRICTION_INHERIT = "INHERIT";
const BOOKING_MODES: BookingRestrictionMode[] = [
  BookingRestrictionMode.NONE,
  BookingRestrictionMode.ATTENDEE_DAY_OF,
  BookingRestrictionMode.HOURS_BEFORE,
  BookingRestrictionMode.ON_PREMISE,
  BookingRestrictionMode.HOUSE_ONLY,
];

function parseBookingRestrictionOverride(raw: unknown): BookingRestrictionMode | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s === BOOKING_RESTRICTION_INHERIT) return null;
  return BOOKING_MODES.includes(s as BookingRestrictionMode) ? (s as BookingRestrictionMode) : null;
}

function parseOptionalPositiveInt(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function adminUpdateSlot(formData: FormData) {
  await assertAdminSession();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/internal/admin/events?error=missing_slot");

  const startMin = parseInt(String(formData.get("startMin") ?? ""), 10);
  const endMin = parseInt(String(formData.get("endMin") ?? ""), 10);
  const statusRaw = String(formData.get("status") ?? "");
  const manualRaw = formData.get("manualLineupLabel");
  const manualLineupLabel = typeof manualRaw === "string" ? (manualRaw.trim() || null) : null;

  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || startMin < 0 || endMin > 24 * 60 || startMin >= endMin) {
    redirect(`/internal/admin/slots/${id}?error=${encodeURIComponent("Invalid slot times.")}`);
  }
  if (!Object.values(SlotStatus).includes(statusRaw as SlotStatus)) {
    redirect(`/internal/admin/slots/${id}?error=${encodeURIComponent("Invalid slot status.")}`);
  }
  const status = statusRaw as SlotStatus;

  const modeOverride = parseBookingRestrictionOverride(formData.get("bookingRestrictionModeOverride"));
  const hoursOverride = parseOptionalPositiveInt(formData.get("restrictionHoursBeforeOverride"));
  const metersOverride = parseOptionalPositiveInt(formData.get("onPremiseMaxDistanceMetersOverride"));

  const prisma = requirePrisma();
  const slot = await prisma.slot.findUnique({
    where: { id },
    include: {
      booking: { select: { id: true } },
      instance: { include: { template: { include: { venue: true } } } },
    },
  });
  if (!slot) redirect("/internal/admin/events?error=missing_slot");

  if (status === SlotStatus.AVAILABLE && slot.booking) {
    redirect(
      `/internal/admin/slots/${id}?error=${encodeURIComponent("Remove or delete the booking before setting slot to AVAILABLE.")}`,
    );
  }

  if (startMin !== slot.startMin) {
    const clash = await prisma.slot.findFirst({
      where: { instanceId: slot.instanceId, startMin, NOT: { id } },
    });
    if (clash) {
      redirect(
        `/internal/admin/slots/${id}?error=${encodeURIComponent("Another slot already uses this start time on this night.")}`,
      );
    }
  }

  await prisma.slot.update({
    where: { id },
    data: {
      startMin,
      endMin,
      status,
      manualLineupLabel,
      bookingRestrictionModeOverride: modeOverride,
      restrictionHoursBeforeOverride: hoursOverride,
      onPremiseMaxDistanceMetersOverride: metersOverride,
    },
  });

  revalidatePath(`/internal/admin/events/${slot.instanceId}`);
  revalidatePath(`/internal/admin/slots/${id}`);
  revalidatePath("/internal/admin/bookings");
  revalidateVenueSlugAndAdminLists(slot.instance.template.venue.slug);
  redirect(`/internal/admin/slots/${id}?saved=1`);
}

const DELETE_BOOKING_CONFIRM = "DELETE BOOKING";
const DELETE_HISTORY_CONFIRM = "DELETE PERFORMER HISTORY";

export async function adminDeleteBooking(formData: FormData) {
  await assertAdminSession();
  const id = String(formData.get("id") ?? "");
  const confirm = String(formData.get("confirmPhrase") ?? "").trim();
  const clearManual =
    formData.get("clearManualLineupLabel") === "on" || formData.get("clearManualLineupLabel") === "true";
  if (!id) redirect("/internal/admin/bookings?error=missing_id");
  if (confirm !== DELETE_BOOKING_CONFIRM) {
    redirect(`/internal/admin/bookings/${id}?error=${encodeURIComponent("Type DELETE BOOKING to confirm.")}`);
  }

  const prisma = requirePrisma();
  const b = await prisma.booking.findUnique({
    where: { id },
    include: { slot: { include: { instance: { include: { template: { include: { venue: true } } } } } } },
  });
  if (!b) redirect("/internal/admin/bookings?error=missing_id");

  const slotId = b.slotId;
  const slug = b.slot.instance.template.venue.slug;

  await prisma.$transaction(async (tx) => {
    await tx.booking.delete({ where: { id } });
    await tx.slot.update({
      where: { id: slotId },
      data: {
        status: SlotStatus.AVAILABLE,
        ...(clearManual ? { manualLineupLabel: null } : {}),
      },
    });
  });

  revalidatePath("/internal/admin/bookings");
  revalidatePath(`/internal/admin/bookings/${id}`);
  revalidatePath(`/internal/admin/events/${b.slot.instanceId}`);
  revalidatePath(`/internal/admin/slots/${slotId}`);
  revalidateVenueSlugAndAdminLists(slug);
  redirect(`/internal/admin/bookings?deleted=1`);
}

export async function adminUpdateVenuePerformerHistory(formData: FormData) {
  await assertAdminSession();
  const id = String(formData.get("id") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const showOnPublic =
    formData.get("showOnPublicProfile") === "on" || formData.get("showOnPublicProfile") === "true";
  const useCountRaw = String(formData.get("useCount") ?? "").trim();
  const useCount = parseInt(useCountRaw, 10);
  if (!id) redirect("/internal/admin/performer-history?error=missing_id");
  if (!displayName) {
    redirect(`/internal/admin/performer-history/${id}?error=${encodeURIComponent("Display name required.")}`);
  }
  if (!Number.isFinite(useCount) || useCount < 1) {
    redirect(`/internal/admin/performer-history/${id}?error=${encodeURIComponent("Use count must be at least 1.")}`);
  }

  const prisma = requirePrisma();
  const row = await prisma.venuePerformerHistory.findUnique({
    where: { id },
    include: { venue: { select: { slug: true } } },
  });
  if (!row) redirect("/internal/admin/performer-history?error=missing_id");

  await prisma.venuePerformerHistory.update({
    where: { id },
    data: { displayName, showOnPublicProfile: showOnPublic, useCount },
  });
  revalidatePath("/internal/admin/performer-history");
  revalidatePath(`/internal/admin/performer-history/${id}`);
  revalidateVenueSlugAndAdminLists(row.venue.slug);
  redirect(`/internal/admin/performer-history/${id}?saved=1`);
}

export async function adminDeleteVenuePerformerHistory(formData: FormData) {
  await assertAdminSession();
  const id = String(formData.get("id") ?? "");
  const confirm = String(formData.get("confirmPhrase") ?? "").trim();
  if (!id) redirect("/internal/admin/performer-history?error=missing_id");
  if (confirm !== DELETE_HISTORY_CONFIRM) {
    redirect(`/internal/admin/performer-history/${id}?error=${encodeURIComponent("Type DELETE PERFORMER HISTORY to confirm.")}`);
  }

  const prisma = requirePrisma();
  const row = await prisma.venuePerformerHistory.findUnique({
    where: { id },
    include: { venue: { select: { slug: true } } },
  });
  if (!row) redirect("/internal/admin/performer-history?error=missing_id");

  await prisma.venuePerformerHistory.delete({ where: { id } });
  revalidatePath("/internal/admin/performer-history");
  revalidateVenueSlugAndAdminLists(row.venue.slug);
  redirect(`/internal/admin/performer-history?venueId=${encodeURIComponent(row.venueId)}&deleted=1`);
}

function accountTypeFromForm(v: FormDataEntryValue | null): PasswordResetAccountType | null {
  if (v === "VENUE" || v === "MUSICIAN") return v;
  return null;
}

export async function adminSendResetEmail(formData: FormData) {
  await assertAdminSession();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const type = accountTypeFromForm(formData.get("accountType"));
  const ret = sanitizeAdminReturnPath(formData.get("returnPath"));
  if (!email || !type) redirect(`${ret}?resetError=missing_fields`);

  const out = await sendPasswordResetEmailForAdmin({ accountType: type, email });
  if (!out.ok) {
    redirect(`${ret}?resetError=${encodeURIComponent(out.error)}`);
  }
  redirect(`${ret}?resetSent=1`);
}

export async function adminGenerateResetLink(formData: FormData) {
  await assertAdminSession();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const type = accountTypeFromForm(formData.get("accountType"));
  const ret = sanitizeAdminReturnPath(formData.get("returnPath"));
  if (!email || !type) redirect(`${ret}?linkError=missing_fields`);

  const out = await createPasswordResetLinkForAdmin({ accountType: type, email });
  if (!out.ok) {
    redirect(`${ret}?linkError=${encodeURIComponent(out.error)}`);
  }
  redirect(`${ret}?resetLink=${encodeURIComponent(out.link)}`);
}
