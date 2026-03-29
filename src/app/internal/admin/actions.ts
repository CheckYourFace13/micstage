"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PasswordResetAccountType } from "@/generated/prisma/client";
import { ADMIN_PATH_PREFIX } from "@/lib/adminEdge";
import { assertAdminSession } from "@/lib/adminAuth";
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

  const prisma = requirePrisma();
  await prisma.booking.update({
    where: { id },
    data: { performerName, performerEmail, notes },
  });
  revalidatePath("/internal/admin/bookings");
  revalidatePath(`/internal/admin/bookings/${id}`);
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

export async function adminUpdateEventInstance(formData: FormData) {
  await assertAdminSession();
  const id = String(formData.get("id") ?? "");
  const isCancelled = formData.get("isCancelled") === "on" || formData.get("isCancelled") === "true";
  if (!id) redirect("/internal/admin/events?error=missing_id");

  const prisma = requirePrisma();
  await prisma.eventInstance.update({
    where: { id },
    data: { isCancelled },
  });
  revalidatePath("/internal/admin/events");
  revalidatePath(`/internal/admin/events/${id}`);
  redirect(`/internal/admin/events/${id}?saved=1`);
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
