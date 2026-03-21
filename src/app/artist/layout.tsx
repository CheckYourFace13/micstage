import type { Metadata } from "next";
import { privateNoIndexMetadata } from "@/lib/privateSeo";

export const metadata: Metadata = {
  ...privateNoIndexMetadata,
};

export default function ArtistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
