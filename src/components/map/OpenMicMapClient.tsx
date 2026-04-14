"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VenuePerformanceFormat, Weekday } from "@/generated/prisma/client";
import type { OpenMicMapVenueDto } from "@/lib/map/openMicMapTypes";
import {
  OPEN_MIC_MAP_FALLBACK_CENTER,
  OPEN_MIC_MAP_FALLBACK_ZOOM,
  venueInBoundsPayload,
  type MapBoundsPayload,
} from "@/lib/map/openMicMapBounds";
import { OPEN_MIC_MAP_FORMAT_FILTER_OPTIONS } from "@/lib/map/openMicMapFormatFilters";
import { centerOfBoundsPayload, sortVenuesByProximity } from "@/lib/map/sortVenuesByProximity";
import { performanceFormatLabel } from "@/lib/venueDisplay";
import { weekdayToLabel } from "@/lib/time";

const OpenMicLeafletMap = dynamic(
  () => import("@/components/map/OpenMicLeafletMap").then((m) => m.OpenMicLeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(52vh,440px)] min-h-[280px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-white/15 bg-zinc-900/50 px-4 text-center sm:min-h-[320px]">
        <span className="text-sm font-medium text-white/70">Loading map…</span>
        <span className="max-w-xs text-xs text-white/45">Tiles and pins load after this panel — a moment on slow connections is normal.</span>
      </div>
    ),
  },
);

const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function centroid(venues: Pick<OpenMicMapVenueDto, "lat" | "lng">[]): [number, number] {
  if (venues.length === 0) return OPEN_MIC_MAP_FALLBACK_CENTER;
  let sLat = 0;
  let sLng = 0;
  for (const v of venues) {
    sLat += v.lat;
    sLng += v.lng;
  }
  return [sLat / venues.length, sLng / venues.length];
}

function nextBadgeClass(badge: "live" | "tonight" | "upcoming"): string {
  switch (badge) {
    case "live":
      return "border-emerald-500/50 bg-emerald-500/15 text-emerald-200";
    case "tonight":
      return "border-amber-500/45 bg-amber-500/12 text-amber-100";
    default:
      return "border-white/20 bg-white/5 text-white/80";
  }
}

export function OpenMicMapClient(props: { venues: OpenMicMapVenueDto[] }) {
  const { venues: allVenues } = props;
  const [dayFilter, setDayFilter] = useState<Weekday | null>(null);
  const [formatFilter, setFormatFilter] = useState<VenuePerformanceFormat | "">("");
  const [acceptingOnly, setAcceptingOnly] = useState(false);
  const [mapBounds, setMapBounds] = useState<MapBoundsPayload | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [flyToNonce, setFlyToNonce] = useState(0);
  const [refitNonce, setRefitNonce] = useState(0);
  const [geoHint, setGeoHint] = useState<string | null>(null);
  const [userCenter, setUserCenter] = useState<[number, number] | null>(null);
  const [userLocateNonce, setUserLocateNonce] = useState(0);

  const firstFilterEffect = useRef(true);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const filterSig = `${dayFilter ?? "any"}-${formatFilter || "any"}-${acceptingOnly ? "1" : "0"}`;

  useEffect(() => {
    if (firstFilterEffect.current) {
      firstFilterEffect.current = false;
      return;
    }
    setRefitNonce((n) => n + 1);
  }, [filterSig]);

  const filtered = useMemo(() => {
    return allVenues.filter((v) => {
      if (dayFilter && !v.weekdays.includes(dayFilter)) return false;
      if (formatFilter && !v.performanceFormats.includes(formatFilter)) return false;
      if (acceptingOnly && !v.acceptingSignups) return false;
      return true;
    });
  }, [allVenues, dayFilter, formatFilter, acceptingOnly]);

  const visible = useMemo(() => {
    if (!mapBounds) return filtered;
    return filtered.filter((v) => venueInBoundsPayload(mapBounds, v.lat, v.lng));
  }, [filtered, mapBounds]);

  const initialCenter = useMemo(() => centroid(allVenues), [allVenues]);
  const initialZoom = allVenues.length === 0 ? OPEN_MIC_MAP_FALLBACK_ZOOM : allVenues.length === 1 ? 12 : 10;

  const sortOrigin = useMemo(() => {
    if (mapBounds) return centerOfBoundsPayload(mapBounds);
    return { lat: initialCenter[0], lng: initialCenter[1] };
  }, [mapBounds, initialCenter]);

  const sortedVisible = useMemo(() => {
    if (visible.length === 0) return visible;
    return sortVenuesByProximity(visible, sortOrigin);
  }, [visible, sortOrigin]);

  const onSelectSlug = useCallback((slug: string) => {
    setSelectedSlug(slug);
    setFlyToNonce((n) => n + 1);
    const el = itemRefs.current.get(slug);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const onBoundsPayload = useCallback((b: MapBoundsPayload) => {
    setMapBounds(b);
  }, []);

  const onUseMyLocation = () => {
    setGeoHint(null);
    if (!navigator.geolocation) {
      setGeoHint("Location isn’t available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCenter([pos.coords.latitude, pos.coords.longitude]);
        setUserLocateNonce((n) => n + 1);
        setGeoHint(null);
      },
      () => {
        setGeoHint("We couldn’t read your location. You can still pan and zoom the map.");
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const clearAllFilters = () => {
    setDayFilter(null);
    setFormatFilter("");
    setAcceptingOnly(false);
  };

  const hasActiveFilters = dayFilter !== null || formatFilter !== "" || acceptingOnly;

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <section
        id="open-mic-map-filters"
        className="flex flex-col gap-4 rounded-xl border border-white/12 bg-white/[0.04] p-4 backdrop-blur-sm sm:p-5"
        aria-label="Map filters"
      >
        <div>
          <h2 className="text-sm font-semibold text-white">Find your night</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            Pick a weekday to color pins by that open mic night. Leave it on &ldquo;Any day&rdquo; for MicStage pink pins
            when a venue runs multiple nights. Recently active MicStage venues without a current public schedule are still
            shown, so you can discover and follow up early. The list on the right stays in sync with what you see on the map.
          </p>
        </div>

        <fieldset className="min-w-0 border-0 p-0">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Which night?</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by weekday">
            <button
              type="button"
              onClick={() => setDayFilter(null)}
              aria-pressed={dayFilter === null}
              className={`min-h-11 rounded-full border px-3 py-2 text-xs font-semibold transition sm:min-h-0 sm:py-1.5 ${
                dayFilter === null
                  ? "border-[rgb(var(--om-neon))]/60 bg-[rgb(var(--om-neon))]/15 text-white"
                  : "border-white/20 text-white/75 hover:border-white/35 hover:text-white"
              }`}
            >
              Any day
            </button>
            {WEEKDAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDayFilter(d)}
                aria-label={weekdayToLabel(d)}
                aria-pressed={dayFilter === d}
                className={`min-h-11 min-w-[3rem] rounded-full border px-2.5 py-2 text-xs font-semibold transition sm:min-h-0 sm:min-w-0 sm:px-3 sm:py-1.5 ${
                  dayFilter === d
                    ? "border-[rgb(var(--om-neon))]/60 bg-[rgb(var(--om-neon))]/15 text-white"
                    : "border-white/20 text-white/75 hover:border-white/35 hover:text-white"
                }`}
              >
                {weekdayToLabel(d).slice(0, 3)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:gap-4">
          <label className="flex min-w-[min(100%,220px)] flex-1 flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/50">What kind of open mic?</span>
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter((e.target.value || "") as VenuePerformanceFormat | "")}
              className="min-h-11 rounded-lg border border-white/25 bg-zinc-950 px-3 py-2.5 text-sm text-white sm:min-h-0"
              aria-label="Filter by performance format"
            >
              <option value="">All formats</option>
              {OPEN_MIC_MAP_FORMAT_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Booking</span>
            <button
              type="button"
              onClick={() => setAcceptingOnly((a) => !a)}
              aria-pressed={acceptingOnly}
              className={`min-h-11 rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition sm:min-h-0 ${
                acceptingOnly
                  ? "border-emerald-500/55 bg-emerald-500/15 text-emerald-100"
                  : "border-white/20 text-white/80 hover:border-white/35"
              }`}
            >
              <span className="block font-semibold text-white">Online signup open</span>
              <span className="mt-0.5 block text-xs font-normal text-white/55">
                Only venues with at least one bookable slot soon (not house-only nights).
              </span>
            </button>
          </div>

          <div className="flex w-full flex-wrap gap-2 lg:ml-auto lg:w-auto lg:justify-end">
            <button
              type="button"
              onClick={onUseMyLocation}
              className="min-h-11 flex-1 rounded-lg border border-white/25 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:border-[rgb(var(--om-neon))]/45 hover:bg-white/10 sm:min-h-0 sm:flex-none"
            >
              Near me
            </button>
            <button
              type="button"
              onClick={() => setRefitNonce((n) => n + 1)}
              className="min-h-11 flex-1 rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold text-white/90 hover:border-white/40 sm:min-h-0 sm:flex-none"
            >
              Show all matches
            </button>
          </div>
        </div>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearAllFilters}
            className="self-start text-xs font-semibold text-[rgb(var(--om-neon))] underline decoration-[rgb(var(--om-neon))]/40 underline-offset-2 hover:brightness-110"
          >
            Clear filters
          </button>
        ) : null}

        {geoHint ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95" role="status">
            {geoHint}
          </p>
        ) : null}

        <p className="text-xs text-white/50" aria-live="polite">
          <span className="font-medium text-white/65">Map:</span>{" "}
          <span className="tabular-nums text-white/80">{visible.length}</span> in view ·{" "}
          <span className="font-medium text-white/65">Filters:</span>{" "}
          <span className="tabular-nums text-white/80">{filtered.length}</span> ·{" "}
          <span className="font-medium text-white/65">Total:</span>{" "}
          <span className="tabular-nums text-white/80">{allVenues.length}</span> on MicStage
        </p>
      </section>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-5">
        <section
          className="min-h-[min(52vh,480px)] flex-1 lg:min-h-[520px]"
          aria-label="Interactive map of open mic venues"
          aria-describedby="open-mic-map-filters"
        >
          <OpenMicLeafletMap
            venues={visible}
            refitTargets={filtered}
            refitNonce={refitNonce}
            dayFilter={dayFilter}
            selectedSlug={selectedSlug}
            onSelectSlug={onSelectSlug}
            onBoundsPayload={onBoundsPayload}
            initialCenter={initialCenter}
            initialZoom={initialZoom}
            flyToNonce={flyToNonce}
            flyToSlug={selectedSlug}
            userCenter={userCenter}
            userLocateNonce={userLocateNonce}
          />
        </section>

        <aside className="flex w-full flex-col border-t border-white/10 pt-4 lg:w-[min(100%,400px)] lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <h2 className="text-sm font-semibold text-white">Venues on this map</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/50">
            Same pins as the list — sorted by distance from the center of what you&apos;re looking at. Tap a row to zoom
            the map; tap a pin for a quick summary.
          </p>
          <div className="mt-3 flex max-h-[min(52vh,520px)] flex-col gap-2 overflow-y-auto overscroll-contain pr-1 pb-2 [-webkit-overflow-scrolling:touch] lg:max-h-[520px]">
            {sortedVisible.length === 0 ? (
              <div className="rounded-xl border border-white/12 bg-zinc-900/45 px-4 py-6 text-sm leading-relaxed text-white/70">
                {filtered.length === 0 ? (
                  <>
                    <p className="font-medium text-white/90">No venues match these filters.</p>
                    <p className="mt-2 text-white/60">
                      Try another night, turn off &ldquo;Online signup open,&rdquo; or switch format. You can also search
                      by place in{" "}
                      <Link href="/find-open-mics" className="font-semibold text-[rgb(var(--om-neon))] underline">
                        Find open mics
                      </Link>
                      .
                    </p>
                    {hasActiveFilters ? (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="mt-4 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:border-white/35"
                      >
                        Reset filters
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="font-medium text-white/90">Nothing in this part of the map.</p>
                    <p className="mt-2 text-white/60">
                      Zoom out, drag the map, or tap{" "}
                      <span className="text-white/80">&ldquo;Show all matches&rdquo;</span> to jump back to every venue
                      that passes your filters ({filtered.length} right now).
                    </p>
                  </>
                )}
              </div>
            ) : (
              sortedVisible.map((v) => {
                const active = selectedSlug === v.slug;
                const days = [...new Set(v.templates.map((t) => weekdayToLabel(t.weekday)))].join(", ");
                const formats = [...new Set(v.performanceFormats.map((f) => performanceFormatLabel(f)))].join(" · ");
                return (
                  <div
                    key={v.slug}
                    className={`overflow-hidden rounded-xl border transition ${
                      active
                        ? "border-[rgb(var(--om-neon))]/55 bg-[rgb(var(--om-neon))]/10"
                        : "border-white/12 bg-zinc-900/35 hover:border-white/25"
                    }`}
                  >
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) itemRefs.current.set(v.slug, el);
                        else itemRefs.current.delete(v.slug);
                      }}
                      aria-pressed={active}
                      aria-label={`${v.name}, zoom map to this venue`}
                      onClick={() => onSelectSlug(v.slug)}
                      className="w-full px-3 py-3 text-left focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[rgb(var(--om-neon))]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-white">{v.name}</div>
                          <div className="mt-0.5 text-xs text-white/55">
                            {[v.city, v.region].filter(Boolean).join(", ") || "Full address on venue page"}
                          </div>
                        </div>
                        {v.nextEvent ? (
                          <span
                            className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${nextBadgeClass(v.nextEvent.badge)}`}
                          >
                            {v.nextEvent.badge}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs text-white/60">
                        {v.hasPublicSchedule ? (
                          <span className="text-white/75">Open mic: {days}</span>
                        ) : (
                          <span className="text-white/75">MicStage venue · recently active</span>
                        )}
                        {v.hasPublicSchedule && v.templates.length > 1 ? (
                          <span className="text-white/40"> · {v.templates.length} recurring nights</span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-white/55">{v.hasPublicSchedule ? formats : "Schedule details coming soon"}</p>
                      {v.nextEvent && v.hasPublicSchedule ? (
                        <p className="mt-1 text-xs text-white/75">{v.nextEvent.timeLabel}</p>
                      ) : (
                        <p className="mt-1 text-xs text-white/45">
                          {v.hasPublicSchedule ? "Full schedule on venue page" : "Visit the venue page for latest updates"}
                        </p>
                      )}
                    </button>
                    <div className="border-t border-white/10 px-3 py-2.5">
                      <Link
                        href={`/venues/${v.slug}`}
                        className="text-xs font-semibold text-[rgb(var(--om-neon))] underline decoration-[rgb(var(--om-neon))]/35 underline-offset-2 hover:brightness-110"
                      >
                        Open venue page to book →
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
