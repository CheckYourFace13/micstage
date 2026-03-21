"use server";

import bcrypt from "bcryptjs";
import { requirePrisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { consumeRateLimit } from "@/lib/rateLimit";
import { safeAfterAuthPath } from "@/lib/safeRedirect";

function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`${key} is required`);
  return v.trim();
}

function loginMusicianErrorRedirect(code: "rate" | "invalid", nextField: string): never {
  const q = new URLSearchParams({ error: code });
  if (nextField) q.set("next", nextField);
  redirect(`/login/musician?${q.toString()}`);
}

export async function loginMusician(formData: FormData) {
  const email = reqString(formData, "email").toLowerCase();
  const password = reqString(formData, "password");
  const nextEntry = formData.get("next");
  const nextField = (typeof nextEntry === "string" ? nextEntry : "").trim();

  const rl = await consumeRateLimit({
    scope: "login:musician",
    identifier: email,
    limit: 10,
    windowSec: 60 * 15,
  });
  if (!rl.allowed) loginMusicianErrorRedirect("rate", nextField);

  const prisma = requirePrisma();
  const user = await prisma.musicianUser.findUnique({ where: { email } });
  if (!user) loginMusicianErrorRedirect("invalid", nextField);
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) loginMusicianErrorRedirect("invalid", nextField);

  await setSession({ kind: "musician", musicianId: user.id, email: user.email });
  redirect(safeAfterAuthPath(nextField, "/artist"));
}

