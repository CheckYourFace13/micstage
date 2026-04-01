"use server";

import bcrypt from "bcryptjs";
import { isNextRedirectError } from "@/lib/nextRedirect";
import { getPrismaOrNull } from "@/lib/prisma";
import { setSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { consumeRateLimit } from "@/lib/rateLimit";
import { JOINED_MUSICIAN, PRODUCT_ANALYTICS_QS } from "@/lib/productAnalytics";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";

function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`${key} is required`);
  return v.trim();
}

export async function registerMusician(formData: FormData) {
  const email = reqString(formData, "email").toLowerCase();
  const password = reqString(formData, "password");
  const stageName = reqString(formData, "stageName");

  const rl = await consumeRateLimit({
    scope: "register:musician",
    identifier: email,
    limit: 6,
    windowSec: 60 * 60,
  });
  if (!rl.allowed) redirect("/register/musician?error=rate");

  const passwordHash = await bcrypt.hash(password, 12);

  const prisma = getPrismaOrNull();
  if (!prisma) {
    console.error("[registerMusician] database not configured");
    redirect("/register/musician?error=unavailable");
  }

  try {
    const existing = await prisma.musicianUser.findUnique({ where: { email } });
    if (existing) redirect("/login/musician");

    const musician = await prisma.musicianUser.create({
      data: { email, passwordHash, stageName },
    });

    await setSession({ kind: "musician", musicianId: musician.id, email: musician.email });
    redirect(`${ARTIST_DASHBOARD_HREF}?${PRODUCT_ANALYTICS_QS.joined}=${JOINED_MUSICIAN}`);
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    console.error("[registerMusician]", e);
    redirect("/register/musician?error=unavailable");
  }
}

