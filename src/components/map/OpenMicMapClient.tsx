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
import { performanceFormatLabel } from "@/lib/venueDisplay";
import { weekdayToLabel } from "@/lib/time";

const OpenMicLeafletMap = dynamic(
  () => import("@/components/map/OpenMicLeafletMap").then((m) => m.OpenMicLeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(52vh,420px)] min-h-[280px] w-full items-center justify-center rounded-xl border border-white/15 bg-zinc-900/50 text-sm text-white/60">
        Loading map…
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
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  const sortedVisible = useMemo(() => {
    return [...visible].sort((a, b) => a.name.localeCompare(b.name));
  }, [visible]);

  const initialCenter = useMemo(() => centroid(allVenues), [allVenues]);
  const initialZoom = allVenues.length === 0 ? OPEN_MIC_MAP_FALLBACK_ZOOM : allVenues.length === 1 ? 12 : 10;

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

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-white/12 bg-white/[0.04] p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-white/45">Day</span>
          <button
            type="button"
            onClick={() => setDayFilter(null)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
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
              className={`rounded-full border px-2.5 py-1.5 text-xs font-medium transition sm:px-3 ${
                dayFilter === d
                  ? "border-[rgb(var(--om-neon))]/60 bg-[rgb(var(--om-neon))]/15 text-white"
                  : "border-white/20 text-white/75 hover:border-white/35 hover:text-white"
              }`}
            >
              {weekdayToLabel(d).slice(0, 3)}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-white/55">
            <span className="font-medium uppercase tracking-wider">Performance type</span>
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter((e.target.value || "") as VenuePerformanceFormat | "")}
              className="rounded-lg border border-white/25 bg-zinc-950 px-3 py-2 text-sm text-white"
            >
              <option value="">Any format</option>
              {OPEN_MIC_MAP_FORMAT_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setAcceptingOnly((a) => !a)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
              acceptingOnly
                ? "border-emerald-500/55 bg-emerald-500/15 text-emerald-100"
                : "border-white/20 text-white/80 hover:border-white/35"
            }`}
          >
            Accepting online signups
          </button>

          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={onUseMyLocation}
              className="rounded-lg border border-white/25 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:border-[rgb(var(--om-neon))]/45 hover:bg-white/10"
            >
              Use my location
            </button>
            <button
              type="button"
              onClick={() => setRefitNonce((n) => n + 1)}
              className="rounded-lg border border-white/25 px-4 py-2 text-sm font-medium text-white/85 hover:border-white/40"
            >
              Fit all matches
            </button>
          </div>
        </div>

        {geoHint ? <p className="text-xs text-amber-200/90">{geoHint}</p> : null}

        <p className="text-xs text-white/50">
          Showing <span className="text-white/80">{visible.length}</span> in view ·{" "}
          <span className="text-white/80">{filtered.length}</span> matching filters ·{" "}
          <span className="text-white/80">{allVenues.length}</span> mappable venues total
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="min-h-[min(52vh,480px)] flex-1 lg:min-h-[520px]">
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
        </div>

        <aside className="flex w-full flex-col lg:w-[min(100%,380px)] lg:shrink-0">
          <h2 className="text-sm font-semibold text-white">In this view</h2>
          <p className="mt-1 text-xs text-white/50">Results update as you pan or zoom. Open a pin for quick details.</p>
          <div
            ref={listRef}
            className="mt-3 flex max-h-[min(52vh,520px)] flex-col gap-2 overflow-y-auto pr-1 pb-2 lg:max-h-[520px]"
          >
            {sortedVisible.length === 0 ? (
              <div className="rounded-lg border border-white/15 bg-zinc-900/40 px-3 py-8 text-center text-sm text-white/60">
                No venues here. Zoom out, clear filters, or try{" "}
                <Link href="/find-open-mics" className="text-[rgb(var(--om-neon))] underline">
                  text search
                </Link>
                .
              </div>
            ) : (
              sortedVisible.map((v) => {
                const active = selectedSlug === v.slug;
                const days = [...new Set(v.templates.map((t) => weekdayToLabel(t.weekday)))].join(", ");
                return (
                  <div
                    key={v.slug}
                    ref={(el) => {
                      if (el) itemRefs.current.set(v.slug, el);
                      else itemRefs.current.delete(v.slug);
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectSlug(v.slug)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectSlug(v.slug);
                      }
                    }}
                    className={`cursor-pointer rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-[rgb(var(--om-neon))]/55 bg-[rgb(var(--om-neon))]/10"
                        : "border-white/12 bg-zinc-900/35 hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">{v.name}</div>
                        <div className="mt-0.5 text-xs text-white/55">
                          {[v.city, v.region].filter(Boolean).join(", ") || "Address on venue page"}
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
                      <span className="text-white/75">{days}</span>
                      {" · "}
                      {[...new Set(v.performanceFormats.map((f) => performanceFormatLabel(f)))].join(" · ")}
                    </p>
                    {v.nextEvent ? (
                      <p className="mt-1 text-xs text-white/70">{v.nextEvent.timeLabel}</p>
                    ) : (
                      <p className="mt-1 text-xs text-white/45">See venue page for schedule</p>
                    )}
                    <Link
                      href={`/venues/${v.slug}`}
                      className="mt-2 inline-block text-xs font-semibold text-[rgb(var(--om-neon))] underline hover:brightness-110"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View venue &amp; book →
                    </Link>
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
