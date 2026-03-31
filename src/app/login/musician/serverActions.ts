"use server";

import bcrypt from "bcryptjs";
import { redirect, unstable_rethrow } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rateLimit";
import { safeAfterAuthPath } from "@/lib/safeRedirect";
import { setSession } from "@/lib/session";

function musicianLoginQuery(code: string, nextField: string): string {
  const q = new URLSearchParams({ error: code });
  if (nextField) q.set("next", nextField);
  return `/login/musician?${q.toString()}`;
}

export async function loginMusician(formData: FormData) {
  const nextEntry = formData.get("next");
  const nextField = (typeof nextEntry === "string" ? nextEntry : "").trim();

  try {
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

    const user = await prisma.musicianUser.findUnique({ where: { email } });
    if (!user) redirect(musicianLoginQuery("invalid", nextField));
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) redirect(musicianLoginQuery("invalid", nextField));

    await setSession({ kind: "musician", musicianId: user.id, email: user.email });
    redirect(safeAfterAuthPath(nextField, "/artist"));
  } catch (e) {
    // Let Next.js handle redirect/notFound/dynamic-control-flow; do not treat as login failure.
    unstable_rethrow(e);
    console.error("[loginMusician]", e);
    redirect(musicianLoginQuery("unavailable", nextField));
  }
}
