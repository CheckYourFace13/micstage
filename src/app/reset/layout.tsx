import type { Metadata } from "next";
import { privateNoIndexMetadata } from "@/lib/privateSeo";

export const metadata: Metadata = {
  ...privateNoIndexMetadata,
};

export default function ResetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
