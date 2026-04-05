"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { VenuePlacePicker } from "@/app/register/venue/VenuePlacePicker";
import type { OpenMicFinderVenue, PublicDiscoveryLocationRow } from "@/lib/discoveryLocationRows";

/** Keep in sync with `MIN_VENUES_FOR_PRIMARY_CITY_DISCOVERY` in discoveryMarket (client-safe copy). */
const MIN_VENUES_FOR_PRIMARY_CITY_PAGE = 10;

type NearbyVenue = {
  slug: string;
  name: string;
  city: string | null;
  region: string | null;
  formattedAddress: string;
  distanceMiles: number | null;
  distanceLabel: string;
};

export function FindOpenMicsClient(props: {
  locationRows: PublicDiscoveryLocationRow[];
  venues: OpenMicFinderVenue[];
}) {
  const { locationRows, venues } = props;
  const [mode, setMode] = useState<"nearby" | "metro">("nearby");
  const [nearbyList, setNearbyList] = useState<NearbyVenue[] | null>(null);
  const [nearbyContext, setNearbyContext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zip, setZip] = useState("");
  const [cityQ, setCityQ] = useState("");
  const [metroFilter, setMetroFilter] = useState("");
  const [selectedMetroSlug, setSelectedMetroSlug] = useState<string | null>(null);

  const googleKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());

  const runNearby = useCallback(async (lat: number, lng: number, label: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/venues/nearby?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`);
      const data = (await res.json()) as { ok?: boolean; venues?: NearbyVenue[]; error?: string };
      if (!res.ok || !data.ok || !data.venues) {
        setError(data.error ?? "Could not load venues.");
        setNearbyList(null);
        return;
      }
      setNearbyList(data.venues);
      setNearbyContext(label);
    } catch {
      setError("Network error. Try again.");
      setNearbyList(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onUseLocation = () => {
    if (!navigator.geolocation) {
      setError("Location isn’t available in this browser. Try ZIP or city below.");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void runNearby(pos.coords.latitude, pos.coords.longitude, "Your current location");
      },
      () => {
        setLoading(false);
        setError("We couldn’t read your location. Enable permission, or use ZIP / city search.");
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const onZipSearch = async () => {
    const z = zip.replace(/\D/g, "").slice(0, 5);
    if (z.length !== 5) {
      setError("Enter a 5-digit US ZIP code.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const g = await fetch(`/api/public/geocode?zip=${encodeURIComponent(z)}`);
      const gj = (await g.json()) as { ok?: boolean; lat?: number; lng?: number; displayName?: string; error?: string };
      if (!g.ok || !gj.ok || gj.lat == null || gj.lng == null) {
        setError(gj.error ?? "ZIP not found.");
        setLoading(false);
        return;
      }
      await runNearby(gj.lat, gj.lng, gj.displayName ?? `ZIP ${z}`);
    } catch {
      setError("Could not look up that ZIP.");
    } finally {
      setLoading(false);
    }
  };

  const onCitySearch = async () => {
    const q = cityQ.trim();
    if (q.length < 2) {
      setError("Type at least 2 characters for city or area search.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const g = await fetch(`/api/public/geocode?q=${encodeURIComponent(q)}`);
      const gj = (await g.json()) as { ok?: boolean; lat?: number; lng?: number; displayName?: string; error?: string };
      if (!g.ok || !gj.ok || gj.lat == null || gj.lng == null) {
        setError(gj.error ?? "Location not found.");
        setLoading(false);
        return;
      }
      await runNearby(gj.lat, gj.lng, gj.displayName ?? q);
    } catch {
      setError("Could not look up that location.");
    } finally {
      setLoading(false);
    }
  };

  const filteredMetros = useMemo(() => {
    const s = metroFilter.trim().toLowerCase();
    if (!s) return locationRows;
    return locationRows.filter((r) => r.label.toLowerCase().includes(s));
  }, [locationRows, metroFilter]);

  const metroVenues = useMemo(() => {
    if (!selectedMetroSlug) return [];
    return venues
      .filter((v) => v.discoverySlug === selectedMetroSlug)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [venues, selectedMetroSlug]);

  const selectedMetroLabel = locationRows.find((r) => r.slug === selectedMetroSlug)?.label ?? null;

  return (
    <div className="mt-8 grid gap-8">
      <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-black/30 p-1">
        <button
          type="button"
          onClick={() => setMode("nearby")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            mode === "nearby" ? "bg-[rgb(var(--om-neon))] text-black" : "text-white/75 hover:bg-white/10"
          }`}
        >
          Near you
        </button>
        <button
          type="button"
          onClick={() => setMode("metro")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            mode === "metro" ? "bg-[rgb(var(--om-neon))] text-black" : "text-white/75 hover:bg-white/10"
          }`}
        >
          By metro area
        </button>
      </div>

      {mode === "nearby" ? (
        <section className="grid gap-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Search near a location</h2>
            <p className="mt-1 text-sm text-white/65">
              We sort open mic venues by distance when we know your search point. Venues without map coordinates still
              appear at the end of the list.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onUseLocation()}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
            >
              Use my location
            </button>
          </div>

          <div className="grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm text-white/80">ZIP code</label>
              <div className="flex flex-wrap gap-2">
                <input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 60601"
                  className="h-11 min-w-[8rem] flex-1 rounded-md border border-white/15 bg-black/40 px-3 text-white placeholder:text-white/40"
                />
                <button
                  type="button"
                  onClick={() => void onZipSearch()}
                  disabled={loading}
                  className="h-11 rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
                >
                  Search
                </button>
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-white/80">City or area (text)</label>
              <div className="flex flex-wrap gap-2">
                <input
                  value={cityQ}
                  onChange={(e) => setCityQ(e.target.value)}
                  placeholder="e.g. Austin, TX"
                  className="h-11 min-w-[10rem] flex-1 rounded-md border border-white/15 bg-black/40 px-3 text-white placeholder:text-white/40"
                  onKeyDown={(e) => e.key === "Enter" && void onCitySearch()}
                />
                <button
                  type="button"
                  onClick={() => void onCitySearch()}
                  disabled={loading}
                  className="h-11 rounded-md border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
                >
                  Search
                </button>
              </div>
            </div>
          </div>

          {googleKey ? (
            <div className="rounded-xl border border-white/10 bg-black/25 p-4">
              <div className="text-sm font-medium text-white/90">City or area (Google suggestions)</div>
              <p className="mt-1 text-xs text-white/50">
                Optional: pick a place from Google’s list when your project has{" "}
                <span className="font-mono text-white/70">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> set.
              </p>
              <div className="mt-3">
                <VenuePlacePicker
                  types={["(cities)"]}
                  label="Start typing a city or region"
                  placeholder="e.g. Nashville, Austin…"
                  onPlace={(p) => void runNearby(p.lat, p.lng, p.formattedAddress)}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
              {error}
            </div>
          ) : null}
          {loading ? <p className="text-sm text-white/55">Loading…</p> : null}

          {nearbyList && nearbyList.length > 0 ? (
            <div className="border-t border-white/10 pt-6">
              {nearbyContext ? (
                <p className="text-sm text-white/70">
                  Results near <span className="text-white/90">{nearbyContext}</span>
                </p>
              ) : null}
              <ul className="mt-4 grid gap-3">
                {nearbyList.map((v) => (
                  <li key={v.slug}>
                    <Link
                      href={`/venues/${v.slug}`}
                      className="block rounded-xl border border-white/10 bg-black/30 p-4 transition hover:border-[rgb(var(--om-neon))]/40 hover:bg-black/45"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-white">{v.name}</span>
                        <span className="font-mono text-xs text-[rgb(var(--om-neon))]">{v.distanceLabel}</span>
                      </div>
                      <p className="mt-1 text-xs text-white/55">{v.formattedAddress}</p>
                      <p className="mt-2 text-xs text-[rgb(var(--om-neon))] underline decoration-white/20 underline-offset-2">
                        View schedule &amp; lineup →
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : nearbyList && nearbyList.length === 0 ? (
            <p className="text-sm text-white/60">No venues on MicStage yet.</p>
          ) : null}
        </section>
      ) : (
        <section className="grid gap-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Browse by metropolitan area</h2>
            <p className="mt-1 text-sm text-white/65">
              Markets group nearby cities so you can explore open mics regionally. Smaller towns roll into a larger hub
              until there are at least {MIN_VENUES_FOR_PRIMARY_CITY_PAGE} MicStage venues in that city.
            </p>
          </div>
          <label className="grid max-w-md gap-1 text-sm">
            <span className="text-white/80">Filter metro &amp; regional markets</span>
            <input
              type="search"
              value={metroFilter}
              onChange={(e) => setMetroFilter(e.target.value)}
              placeholder="e.g. Chicagoland, Texas…"
              className="h-11 rounded-md border border-white/15 bg-black/40 px-3 text-white placeholder:text-white/40"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {filteredMetros.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setSelectedMetroSlug(m.slug)}
                className={`rounded-xl border p-4 text-left transition ${
                  selectedMetroSlug === m.slug
                    ? "border-[rgb(var(--om-neon))]/50 bg-[rgba(var(--om-neon),0.08)]"
                    : "border-white/10 bg-black/25 hover:bg-black/40"
                }`}
              >
                <div className="font-semibold text-white">{m.label}</div>
                <div className="mt-1 text-xs text-white/55">
                  {m.count} venue{m.count === 1 ? "" : "s"}
                </div>
              </button>
            ))}
          </div>
          {filteredMetros.length === 0 ? (
            <p className="text-sm text-white/60">No markets match that filter.</p>
          ) : null}

          {selectedMetroSlug && selectedMetroLabel ? (
            <div className="border-t border-white/10 pt-6">
              <h3 className="text-base font-semibold text-white">Open mics in {selectedMetroLabel}</h3>
              <p className="mt-1 text-sm text-white/60">
                Each venue has its own public page with schedules and booking.
              </p>
              {metroVenues.length === 0 ? (
                <p className="mt-3 text-sm text-white/55">No venues mapped to this market in the directory.</p>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {metroVenues.map((v) => (
                    <li key={v.slug}>
                      <Link
                        href={`/venues/${v.slug}`}
                        className="block rounded-xl border border-white/10 bg-black/30 p-4 hover:border-white/20 hover:bg-black/45"
                      >
                        <div className="font-semibold text-white">{v.name}</div>
                        <div className="mt-1 text-xs text-white/55">
                          {[v.city, v.region].filter(Boolean).join(", ") || "MicStage venue"}
                        </div>
                        <span className="mt-2 inline-block text-xs text-[rgb(var(--om-neon))] underline">
                          View lineup →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-sm text-white/55">
                Upcoming artists in this market:{" "}
                <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href={`/locations/${selectedMetroSlug}/performers`}>
                  See who’s booking slots →
                </Link>
              </p>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
