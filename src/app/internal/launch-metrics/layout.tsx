import type { Metadata } from "next";
import { privateNoIndexMetadata } from "@/lib/privateSeo";

export const metadata: Metadata = {
  title: "Launch metrics",
  robots: { ...privateNoIndexMetadata.robots },
};

export default function LaunchMetricsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
