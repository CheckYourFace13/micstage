"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Claim/host CTAs that preserve `?growthLead=` without making listing HTML dynamic.
 */
export function ListingClaimCtas(props: { listingSlug: string }) {
  const [growthLead, setGrowthLead] = useState("");

  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("growthLead")?.trim() ?? "";
      if (/^c[a-z0-9]{24}$/i.test(id)) setGrowthLead(id);
    } catch {
      // ignore
    }
  }, []);

  const q = growthLead ? `?growthLead=${encodeURIComponent(growthLead)}` : "";

  return (
    <>
      <p className="mt-1 text-sm text-white/65">
        MicStage is free — no credit card. Claim the listing as the venue, or manage nights as the host.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/claim/${props.listingSlug}${q}`}
          className="inline-flex h-11 items-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
          data-track-event="listing_claim_cta_click"
          data-listing-slug={props.listingSlug}
        >
          Claim this open mic free
        </Link>
        <Link
          href={`/host${q}`}
          className="inline-flex h-11 items-center rounded-md border border-white/25 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
        >
          Manage as host — free
        </Link>
      </div>
    </>
  );
}
