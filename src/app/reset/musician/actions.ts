"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { consumeRateLimit } from "@/lib/rateLimit";
import { createPasswordReset, consumeResetToken, verifyResetToken } from "@/lib/passwordReset";

function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`${key} is required`);
  return v.trim();
}

export async function requestMusicianPasswordReset(formData: FormData) {
  const email = reqString(formData, "email").toLowerCase();
  const rl = await consumeRateLimit({
    scope: "reset:request:musician",
    identifier: email,
    limit: 5,
    windowSec: 60 * 30,
  });
  if (!rl.allowed) redirect("/reset/musician?error=rate");
  await createPasswordReset({ accountType: "MUSICIAN", email });
  redirect("/reset/musician?sent=1");
}

export async function finalizeMusicianPasswordReset(formData: FormData) {
  const token = reqString(formData, "token");
  const newPassword = reqString(formData, "newPassword");
  const tokenRec = await verifyResetToken({ accountType: "MUSICIAN", token });
  if (!tokenRec) redirect("/reset/musician?error=invalidToken");

  const rl = await consumeRateLimit({
    scope: "reset:finalize:musician",
    identifier: tokenRec.email,
    limit: 8,
    windowSec: 60 * 30,
  });
  if (!rl.allowed) redirect("/reset/musician?error=rate");

  const hash = await bcrypt.hash(newPassword, 12);
  const out = await consumeResetToken({
    accountType: "MUSICIAN",
    token,
    newPasswordHash: hash,
  });
  if (!out.ok) redirect("/reset/musician?error=invalidToken");
  redirect("/login/musician?reset=success");
}

