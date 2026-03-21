"use server";

import bcrypt from "bcryptjs";
import { requirePrisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { consumeRateLimit } from "@/lib/rateLimit";

function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`${key} is required`);
  return v.trim();
}

export async function loginVenue(formData: FormData) {
  const email = reqString(formData, "email").toLowerCase();
  const password = reqString(formData, "password");

  const rl = await consumeRateLimit({
    scope: "login:venue",
    identifier: email,
    limit: 10,
    windowSec: 60 * 15,
  });
  if (!rl.allowed) redirect("/login/venue?error=rate");

  const prisma = requirePrisma();
  const owner = await prisma.venueOwner.findUnique({ where: { email } });
  if (owner && (await bcrypt.compare(password, owner.passwordHash))) {
    await setSession({ kind: "venue", venueOwnerId: owner.id, email: owner.email });
    redirect("/venue");
  }

  const manager = await prisma.venueManager.findUnique({ where: { email } });
  if (manager && (await bcrypt.compare(password, manager.passwordHash))) {
    await setSession({ kind: "venue", venueManagerId: manager.id, email: manager.email });
    redirect("/venue");
  }

  redirect("/login/venue?error=invalid");
}

