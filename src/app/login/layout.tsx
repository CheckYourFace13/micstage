import type { Metadata } from "next";
import { privateNoIndexMetadata } from "@/lib/privateSeo";

export const metadata: Metadata = {
  ...privateNoIndexMetadata,
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
