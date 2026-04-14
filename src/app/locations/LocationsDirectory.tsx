"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { PublicDiscoveryLocationRow } from "@/lib/discoveryLocationRows";

export type LocationRow = PublicDiscoveryLocationRow;

export function LocationsDirectory({ rows }: { rows: PublicDiscoveryLocationRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(s));
  }, [q, rows]);

  return (
    <div className="grid gap-3 md:gap-4">
      <label className="grid max-w-md gap-0.5 md:gap-1">
        <span className="text-xs font-medium text-white/70 md:text-sm md:font-normal md:text-white/80">
          Search metros, regions &amp; cities
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Chicagoland, Austin TX, Central Illinois…"
          className="h-11 rounded-md border border-white/15 bg-black/50 px-3 text-base text-white placeholder:text-white/35 md:text-sm md:placeholder:text-white/40"
          autoComplete="off"
        />
      </label>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/65 md:p-6">
          <p>
            No MicStage venues have address data yet. When venues add a full address, they&apos;ll roll up into discovery
            markets here.
          </p>
          <p className="mt-3">
            <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/register/venue">
              Register a venue
            </Link>{" "}
            ·{" "}
            <Link className="underline hover:text-white" href="/performers">
              Browse artists
            </Link>
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/65 md:p-6">
          No markets match that search.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
          {filtered.map((l) => (
            <Link
              key={l.key}
              href={`/locations/${l.slug}/performers`}
              className="rounded-xl border border-white/10 bg-white/5 p-3.5 hover:bg-white/10 md:p-4"
            >
              <div className="font-semibold">{l.label}</div>
              <div className="mt-1 text-xs text-white/55">{l.count} venue{l.count === 1 ? "" : "s"} on MicStage</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
