import type { Metadata } from "next";
import { privateNoIndexMetadata } from "@/lib/privateSeo";

/** Shell with nav lives in `(console)/layout.tsx` so `/login` stays minimal. */
export const metadata: Metadata = {
  title: "Admin",
  robots: { ...privateNoIndexMetadata.robots },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
