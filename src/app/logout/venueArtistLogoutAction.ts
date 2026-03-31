"use server";

import { redirect } from "next/navigation";
import { clearSession } from "@/lib/session";

/** Clears venue/artist JWT cookie only (admin cookies untouched). Same-origin redirect as admin logout. */
export async function venueArtistLogoutAction() {
  await clearSession();
  redirect("/");
}
