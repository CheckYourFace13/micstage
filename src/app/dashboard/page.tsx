import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/** Friendly entry for bookmarks / “dashboard” links → venue or artist home. */
export const metadata = {
  title: "Dashboard | MicStage",
  alternates: {
    canonical: "https://micstage.com/dashboard",
  },
};
export default async function DashboardPage() {
  const s = await getSession();
  if (!s) redirect("/");
  if (s.kind === "venue") redirect("/venue");
  if (s.kind === "musician") redirect("/artist");
  redirect("/");
}
