"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import { isNextRedirectError } from "@/lib/nextRedirect";
import { consumeRateLimit } from "@/lib/rateLimit";
import { safeAfterAuthPath } from "@/lib/safeRedirect";
import { setSession } from "@/lib/session";

function venueLoginQuery(code: string, nextField: string): string {
  const q = new URLSearchParams({ error: code });
  if (nextField) q.set("next", nextField);
  return `/login/venue?${q.toString()}`;
}

export async function loginVenue(formData: FormData) {
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
      redirect(venueLoginQuery("invalid", nextField));
    }
    const email = emailRaw.trim().toLowerCase();
    const password = passwordRaw;

    const rl = await consumeRateLimit({
      scope: "login:venue",
      identifier: email,
      limit: 10,
      windowSec: 60 * 15,
    });
    if (!rl.allowed) redirect(venueLoginQuery("rate", nextField));

    const prisma = getPrismaOrNull();
    if (!prisma) {
      console.error("[loginVenue] database not configured");
      redirect(venueLoginQuery("unavailable", nextField));
    }

    const owner = await prisma.venueOwner.findUnique({ where: { email } });
    if (owner && (await bcrypt.compare(password, owner.passwordHash))) {
      await setSession({ kind: "venue", venueOwnerId: owner.id, email: owner.email });
      redirect(safeAfterAuthPath(nextField, "/venue"));
    }

    const manager = await prisma.venueManager.findUnique({ where: { email } });
    if (manager && (await bcrypt.compare(password, manager.passwordHash))) {
      await setSession({ kind: "venue", venueManagerId: manager.id, email: manager.email });
      redirect(safeAfterAuthPath(nextField, "/venue"));
    }

    redirect(venueLoginQuery("invalid", nextField));
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    console.error("[loginVenue]", e);
    redirect(venueLoginQuery("unavailable", nextField));
  }
}
