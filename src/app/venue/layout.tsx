import type { Metadata } from "next";
import { VenuePortalStaleActionHint } from "@/components/venue/VenuePortalStaleActionHint";
import { privateNoIndexMetadata } from "@/lib/privateSeo";

export const metadata: Metadata = {
  ...privateNoIndexMetadata,
};

export default function VenuePortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <VenuePortalStaleActionHint />
      {children}
    </>
  );
}
