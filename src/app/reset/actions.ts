"use server";

import { redirect } from "next/navigation";
import { consumeRateLimit } from "@/lib/rateLimit";
import { createPasswordReset } from "@/lib/passwordReset";

function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`${key} is required`);
  return v.trim();
}

export async function requestAnyPasswordReset(formData: FormData) {
  const email = reqString(formData, "email").toLowerCase();
  const rl = await consumeRateLimit({
    scope: "reset:request:any",
    identifier: email,
    limit: 5,
    windowSec: 60 * 30,
  });
  if (!rl.allowed) redirect("/reset?error=rate");

  await createPasswordReset({ email, fallbackToAnyType: true });
  redirect("/reset?sent=1");
}
