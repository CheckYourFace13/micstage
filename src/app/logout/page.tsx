import { redirect } from "next/navigation";
import { logout } from "./actions";

export default async function LogoutPage() {
  await logout();
  redirect("/");
}

