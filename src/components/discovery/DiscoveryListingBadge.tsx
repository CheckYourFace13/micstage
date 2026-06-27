"use client";

import type { DiscoveryListingKind } from "@/lib/publicListings/types";

export function DiscoveryListingBadge(props: {
  kind: DiscoveryListingKind;
  bookable: boolean;
  className?: string;
}) {
  const { kind, bookable, className = "" } = props;
  const label = bookable ? "Bookable on MicStage" : kind === "verified" ? "Verified listing" : "Unclaimed";

  const tone = bookable
    ? "border-[rgb(var(--om-neon))]/45 bg-[rgba(var(--om-neon),0.12)] text-[rgb(var(--om-neon))]"
    : kind === "verified"
      ? "border-cyan-400/35 bg-cyan-500/10 text-cyan-100"
      : "border-white/20 bg-white/5 text-white/70";

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone} ${className}`}>
      {label}
    </span>
  );
}
