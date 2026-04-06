"use server";

import bcrypt from "bcryptjs";
import { redirect, unstable_rethrow } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rateLimit";
import { safeAfterMusicianLoginPath } from "@/lib/safeRedirect";
import { setSession } from "@/lib/session";

function musicianLoginQuery(code: string, nextField: string): string {
  const q = new URLSearchParams({ error: code });
  if (nextField) q.set("next", nextField);
  return `/login/musician?${q.toString()}`;
}

/**
 * Avoid wrapping `redirect()` in a broad try/catch — Next uses thrown redirect errors for navigation;
 * catching and re-handling them can break the client transition and surface the root error boundary.
 */
export async function loginMusician(formData: FormData) {
  const nextEntry = formData.get("next");
  const nextField = (typeof nextEntry === "string" ? nextEntry : "").trim();

  const emailRaw = formData.get("email");
  const passwordRaw = formData.get("password");
  if (
    typeof emailRaw !== "string" ||
    !emailRaw.trim() ||
    typeof passwordRaw !== "string" ||
    !passwordRaw.trim()
  ) {
    redirect(musicianLoginQuery("invalid", nextField));
  }
  const email = emailRaw.trim().toLowerCase();
  const password = passwordRaw;

  const rl = await consumeRateLimit({
    scope: "login:musician",
    identifier: email,
    limit: 10,
    windowSec: 60 * 15,
  });
  if (!rl.allowed) redirect(musicianLoginQuery("rate", nextField));

  const prisma = getPrismaOrNull();
  if (!prisma) {
    console.error("[loginMusician] database not configured");
    redirect(musicianLoginQuery("unavailable", nextField));
  }

  let user;
  try {
    user = await prisma.musicianUser.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
  } catch (e) {
    unstable_rethrow(e);
    console.error("[loginMusician] findUnique", e);
    redirect(musicianLoginQuery("unavailable", nextField));
  }
  if (!user) redirect(musicianLoginQuery("invalid", nextField));

  let passwordOk: boolean;
  try {
    passwordOk = await bcrypt.compare(password, user.passwordHash);
  } catch (e) {
    unstable_rethrow(e);
    console.error("[loginMusician] bcrypt", e);
    redirect(musicianLoginQuery("unavailable", nextField));
  }
  if (!passwordOk) redirect(musicianLoginQuery("invalid", nextField));

  try {
    await setSession({ kind: "musician", musicianId: user.id, email: user.email });
  } catch (e) {
    unstable_rethrow(e);
    console.error("[loginMusician] setSession", e);
    redirect(musicianLoginQuery("unavailable", nextField));
  }

  redirect(safeAfterMusicianLoginPath(nextField));
}
