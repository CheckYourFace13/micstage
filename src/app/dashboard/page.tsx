import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { privateNoIndexMetadata } from "@/lib/privateSeo";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { getSession } from "@/lib/session";

/** Friendly entry for bookmarks / “dashboard” links → venue or artist home. */
export const metadata: Metadata = {
  title: "Dashboard",
  ...privateNoIndexMetadata,
};
export default async function DashboardPage() {
  const s = await getSession();
  if (!s) redirect("/");
  if (s.kind === "venue") redirect("/venue");
  if (s.kind === "musician") redirect(ARTIST_DASHBOARD_HREF);
  redirect("/");
}
