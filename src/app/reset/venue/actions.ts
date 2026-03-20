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

export async function requestVenuePasswordReset(formData: FormData) {
  const email = reqString(formData, "email").toLowerCase();
  const rl = await consumeRateLimit({
    scope: "reset:request:venue",
    identifier: email,
    limit: 5,
    windowSec: 60 * 30,
  });
  if (!rl.allowed) redirect("/reset/venue?error=rate");

  await createPasswordReset({ accountType: "VENUE", email });
  redirect("/reset/venue?sent=1");
}

export async function finalizeVenuePasswordReset(formData: FormData) {
  const token = reqString(formData, "token");
  const newPassword = reqString(formData, "newPassword");

  const tokenRec = await verifyResetToken({ accountType: "VENUE", token });
  if (!tokenRec) redirect("/reset/venue?error=invalidToken");

  const rl = await consumeRateLimit({
    scope: "reset:finalize:venue",
    identifier: tokenRec.email,
    limit: 8,
    windowSec: 60 * 30,
  });
  if (!rl.allowed) redirect("/reset/venue?error=rate");

  const hash = await bcrypt.hash(newPassword, 12);
  const out = await consumeResetToken({
    accountType: "VENUE",
    token,
    newPasswordHash: hash,
  });
  if (!out.ok) redirect("/reset/venue?error=invalidToken");
  redirect("/login/venue?reset=success");
}

