import { redirect } from "next/navigation";
import { logout } from "./actions";

export const metadata = {
  title: "Logged out | MicStage",
  alternates: {
    canonical: "https://micstage.com/logout",
  },
  robots: { index: false, follow: false },
};

export default async function LogoutPage() {
  await logout();
  redirect("/");
}

