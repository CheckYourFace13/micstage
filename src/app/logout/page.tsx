import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { privateNoIndexMetadata } from "@/lib/privateSeo";
import { logout } from "./actions";

export const metadata: Metadata = {
  title: "Signing out",
  ...privateNoIndexMetadata,
};

export default async function LogoutPage() {
  await logout();
  redirect("/");
}

