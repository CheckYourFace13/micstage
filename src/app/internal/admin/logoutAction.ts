"use server";

import { redirect } from "next/navigation";
import { clearAdminSessionCookies } from "@/lib/adminAuth";

/** Clears admin cookies on this request, then navigates home (same-origin redirect, no cross-host cookie mismatch). */
export async function adminLogoutAction() {
  await clearAdminSessionCookies();
  redirect("/");
}
