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

export async function requestPromoterPasswordReset(formData: FormData) {
  const email = reqString(formData, "email").toLowerCase();
  const rl = await consumeRateLimit({
    scope: "reset:request:promoter",
    identifier: email,
    limit: 5,
    windowSec: 60 * 30,
  });
  if (!rl.allowed) redirect("/reset/promoter?error=rate");
  await createPasswordReset({ accountType: "PROMOTER", email });
  redirect("/reset/promoter?sent=1");
}

export async function finalizePromoterPasswordReset(formData: FormData) {
  const token = reqString(formData, "token");
  const newPassword = reqString(formData, "newPassword");
  const tokenRec = await verifyResetToken({ accountType: "PROMOTER", token });
  if (!tokenRec) redirect("/reset/promoter?error=invalidToken");

  const rl = await consumeRateLimit({
    scope: "reset:finalize:promoter",
    identifier: tokenRec.email,
    limit: 8,
    windowSec: 60 * 30,
  });
  if (!rl.allowed) redirect("/reset/promoter?error=rate");

  const hash = await bcrypt.hash(newPassword, 12);
  const out = await consumeResetToken({
    accountType: "PROMOTER",
    token,
    newPasswordHash: hash,
  });
  if (!out.ok) redirect("/reset/promoter?error=invalidToken");
  redirect("/login/promoter?reset=success");
}
