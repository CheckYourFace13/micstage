"use server";

import { redirect } from "next/navigation";
import { setAdminSessionCookie, validateAdminLogin, getAdminSecretOrNull } from "@/lib/adminAuth";

export async function adminLoginAction(formData: FormData) {
  const secretInput = String(formData.get("secret") ?? "");
  const emailInput = String(formData.get("email") ?? "");
  const envSecret = getAdminSecretOrNull();
  if (!envSecret) redirect("/internal/admin/login?error=config");

  const v = validateAdminLogin(secretInput, emailInput || null);
  if (v === "secret") redirect("/internal/admin/login?error=secret");
  if (v === "email") redirect("/internal/admin/login?error=email");

  await setAdminSessionCookie(envSecret, emailInput.trim() || null);
  redirect("/internal/admin");
}
