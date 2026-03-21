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

export async function loginMusician(formData: FormData) {
  const email = reqString(formData, "email").toLowerCase();
  const password = reqString(formData, "password");
  const next = (typeof formData.get("next") === "string" ? (formData.get("next") as string) : "").trim();

  const rl = await consumeRateLimit({
    scope: "login:musician",
    identifier: email,
    limit: 10,
    windowSec: 60 * 15,
  });
  if (!rl.allowed) redirect("/login/musician?error=rate");

  const prisma = requirePrisma();
  const user = await prisma.musicianUser.findUnique({ where: { email } });
  if (!user) redirect("/login/musician?error=invalid");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) redirect("/login/musician?error=invalid");

  await setSession({ kind: "musician", musicianId: user.id, email: user.email });
  if (next.startsWith("/")) redirect(next);
  redirect("/artist");
}

