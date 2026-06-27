"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DiscoveryListingBadge } from "@/components/discovery/DiscoveryListingBadge";
import { EmptyDiscoveryActions } from "@/components/publicListings/EmptyDiscoveryActions";

type NearbyRow = {
  slug: string;
  href: string;
  kind: "claimed" | "verified" | "unclaimed";
  bookable: boolean;
  name: string;
  city: string | null;
  region: string | null;
  formattedAddress: string;
  distanceLabel: string;
};

export function HomeNearYouListings() {
  const [rows, setRows] = useState<NearbyRow[] | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const loadNearby = useCallback(async (lat: number, lng: number, context: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/public/venues/nearby?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
      );
      const data = (await res.json()) as { ok?: boolean; venues?: NearbyRow[] };
      if (data.ok && data.venues) {
        setRows(data.venues.slice(0, 4));
        setLabel(context);
      } else {
        setRows([]);
      }
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLoading(false);
      setRows([]);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void loadNearby(pos.coords.latitude, pos.coords.longitude, "Near you");
      },
      () => {
        setDenied(true);
        setLoading(false);
        setRows([]);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, [loadNearby]);

  if (loading) {
    return <p className="mt-6 text-sm text-white/50">Finding open mics near you…</p>;
  }

  if (denied || !rows || rows.length === 0) {
    return (
      <div className="mt-6 md:mt-8">
        <h2 className="text-sm font-semibold text-white/90 md:text-base">Open mics near you</h2>
        <p className="mt-1 text-xs text-white/55 md:text-sm">
          Enable location or search by ZIP on the find page — we show verified listings and bookable venues in your area.
        </p>
        <div className="mt-3">
          <Link
            href="/find-open-mics"
            className="inline-flex text-sm font-semibold text-[rgb(var(--om-neon))] underline hover:brightness-110"
          >
            Search by city or ZIP →
          </Link>
        </div>
        {rows && rows.length === 0 && !denied ? (
          <div className="mt-4">
            <EmptyDiscoveryActions context="homepage near-you empty" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-6 md:mt-8">
      <h2 className="text-sm font-semibold text-white/90 md:text-base">
        Open mics {label ? `· ${label}` : "near you"}
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map((v) => (
          <li key={`${v.href}-${v.slug}`}>
            <Link
              href={v.href}
              className="block rounded-xl border border-white/10 bg-black/30 p-3.5 hover:border-[rgb(var(--om-neon))]/35 hover:bg-black/40 md:p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white">{v.name}</span>
                <DiscoveryListingBadge kind={v.kind} bookable={v.bookable} />
              </div>
              <p className="mt-1 text-xs text-white/55">
                {[v.city, v.region].filter(Boolean).join(", ") || v.formattedAddress}
              </p>
              <p className="mt-1 text-[10px] text-white/45">{v.distanceLabel} away</p>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/find-open-mics" className="mt-3 inline-block text-xs text-[rgb(var(--om-neon))] underline">
        See all nearby →
      </Link>
    </div>
  );
}
