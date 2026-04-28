"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { Weekday } from "@/generated/prisma/client";
import type { OpenMicMapVenueDto } from "@/lib/map/openMicMapTypes";
import {
  OPEN_MIC_MAP_DIM_MARKER_HEX,
  OPEN_MIC_MAP_NEUTRAL_MARKER_HEX,
} from "@/lib/map/openMicMapTypes";
import { latLngBoundsLiteralFromVenues, payloadFromLeafletBounds } from "@/lib/map/openMicMapBounds";
import type { MapBoundsPayload } from "@/lib/map/openMicMapBounds";
import { performanceFormatLabel } from "@/lib/venueDisplay";
import { weekdayToLabel } from "@/lib/time";

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markerFill(dayFilter: Weekday | null, v: OpenMicMapVenueDto): string {
  if (!dayFilter) return OPEN_MIC_MAP_NEUTRAL_MARKER_HEX;
  return v.weekdays.includes(dayFilter) ? OPEN_MIC_MAP_NEUTRAL_MARKER_HEX : OPEN_MIC_MAP_DIM_MARKER_HEX;
}

function makeDivIcon(color: string, selected: boolean): L.DivIcon {
  const size = selected ? 28 : 24;
  const shadow = selected
    ? "0 0 0 3px rgba(255,255,255,0.92), 0 3px 14px rgba(0,0,0,.42)"
    : "0 2px 10px rgba(0,0,0,.4)";
  return L.divIcon({
    className: "om-map-marker-wrap",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.22),${shadow}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function popupHtml(v: OpenMicMapVenueDto): string {
  const place = [v.city, v.region].filter(Boolean).join(", ") || "Location on file";
  const dayLabels = [...new Set(v.templates.map((t) => weekdayToLabel(t.weekday)))].join(", ");
  const formatLabels = [...new Set(v.performanceFormats.map((f) => performanceFormatLabel(f)))].join(" | ");
  const scheduleLine = v.hasPublicSchedule ? escHtml(dayLabels || "Schedule details coming soon") : "Schedule details coming soon";
  const formatLine = v.hasPublicSchedule ? escHtml(formatLabels || "MicStage venue") : "MicStage venue";
  const next =
    v.nextEvent != null && v.hasPublicSchedule
      ? `${escHtml(v.nextEvent.timeLabel)} <span style="opacity:.85">(${escHtml(v.nextEvent.badge)})</span>`
      : v.hasPublicSchedule
        ? '<span style="opacity:.75">No upcoming night in the current window - open the venue page for full schedule.</span>'
        : '<span style="opacity:.75">Recently active on MicStage. Public schedule details are coming soon.</span>';
  const signup = v.hasPublicSchedule
    ? v.acceptingSignups
      ? '<span style="color:#4ade80">Slots available to book on at least one upcoming night.</span>'
      : '<span style="opacity:.75">Booking may be limited or house-managed - check the venue page.</span>'
    : '<span style="opacity:.75">MicStage venue | recently active.</span>';
  return `
    <div style="min-width:220px;max-width:280px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.35;color:#f5f5f5">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">${escHtml(v.name)}</div>
      <div style="opacity:.85;margin-bottom:6px">${escHtml(place)}</div>
      <div style="margin-bottom:4px"><strong>Nights</strong> | ${scheduleLine}</div>
      <div style="margin-bottom:4px"><strong>Format</strong> | ${formatLine}</div>
      <div style="margin-bottom:6px"><strong>Next</strong> | ${next}</div>
      <div style="margin-bottom:10px;font-size:12px">${signup}</div>
      <a href="/venues/${escHtml(v.slug)}" style="display:inline-block;background:${OPEN_MIC_MAP_NEUTRAL_MARKER_HEX};color:#fff;text-decoration:none;font-weight:600;padding:8px 12px;border-radius:8px;font-size:13px;box-shadow:0 1px 2px rgba(0,0,0,.2)">View venue &amp; book</a>
    </div>
  `;
}

export function OpenMicLeafletMap(props: {
  venues: OpenMicMapVenueDto[];
  refitTargets: OpenMicMapVenueDto[];
  /** Increment (after initial mount) to fit `refitTargets` - filter changes or Fit results. */
  refitNonce: number;
  dayFilter: Weekday | null;
  selectedSlug: string | null;
  onSelectSlug: (slug: string) => void;
  onBoundsPayload: (b: MapBoundsPayload) => void;
  initialCenter: [number, number];
  initialZoom: number;
  flyToNonce: number;
  flyToSlug: string | null;
  userCenter: [number, number] | null;
  userLocateNonce: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const propsRef = useRef(props);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    propsRef.current = props;
  });

  const emitBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    propsRef.current.onBoundsPayload(payloadFromLeafletBounds(map.getBounds()));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const p0 = propsRef.current;
    const map = L.map(el, {
      center: L.latLng(p0.initialCenter[0], p0.initialCenter[1]),
      zoom: p0.initialZoom,
      zoomControl: true,
      scrollWheelZoom: true,
    });
    mapRef.current = map;

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 56,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 16,
    });
    cluster.addTo(map);
    clusterRef.current = cluster;
    queueMicrotask(() => setMapReady(true));
    requestAnimationFrame(() => map.invalidateSize());

    const scheduleEmit = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => emitBounds(), 160);
    };
    map.on("moveend", scheduleEmit);
    map.on("zoomend", scheduleEmit);

    const fitToRefitTargets = () => {
      const p = propsRef.current;
      const b = latLngBoundsLiteralFromVenues(p.refitTargets);
      if (b && p.refitTargets.length > 0) {
        map.fitBounds(b, { padding: [48, 48], maxZoom: 12 });
      }
    };

    requestAnimationFrame(() => {
      emitBounds();
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            map.flyTo([pos.coords.latitude, pos.coords.longitude], 11, { duration: 0.75 });
            requestAnimationFrame(() => emitBounds());
          },
          () => {
            fitToRefitTargets();
            requestAnimationFrame(() => emitBounds());
          },
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
        );
      } else {
        fitToRefitTargets();
        requestAnimationFrame(() => emitBounds());
      }
    });

    return () => {
      setMapReady(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      map.off("moveend", scheduleEmit);
      map.off("zoomend", scheduleEmit);
      cluster.clearLayers();
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, [emitBounds]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(el);
    const onWin = () => map.invalidateSize({ animate: false });
    window.addEventListener("resize", onWin);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWin);
    };
  }, [mapReady]);

  useEffect(() => {
    if (props.refitNonce === 0) return;
    const map = mapRef.current;
    if (!map) return;
    const targets = propsRef.current.refitTargets;
    const b = latLngBoundsLiteralFromVenues(targets);
    if (b && targets.length > 0) {
      map.fitBounds(b, { padding: [44, 44], maxZoom: 13 });
      requestAnimationFrame(() => emitBounds());
    } else {
      map.setView(
        L.latLng(propsRef.current.initialCenter[0], propsRef.current.initialCenter[1]),
        propsRef.current.initialZoom,
        { animate: true },
      );
      requestAnimationFrame(() => emitBounds());
    }
  }, [props.refitNonce, emitBounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.flyToSlug) return;
    const v = props.venues.find((x) => x.slug === props.flyToSlug);
    if (!v) return;
    const z = Math.max(map.getZoom(), 14);
    map.flyTo([v.lat, v.lng], z, { duration: 0.55 });
  }, [props.flyToNonce, props.flyToSlug, props.venues]);

  useEffect(() => {
    if (props.userLocateNonce === 0 || !props.userCenter) return;
    const map = mapRef.current;
    if (!map) return;
    map.flyTo(props.userCenter, 11, { duration: 0.85 });
    requestAnimationFrame(() => emitBounds());
  }, [props.userLocateNonce, props.userCenter, emitBounds]);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    const { venues, dayFilter, selectedSlug, onSelectSlug } = propsRef.current;
    for (const v of venues) {
      const fill = markerFill(dayFilter, v);
      const icon = makeDivIcon(fill, selectedSlug === v.slug);
      const marker = L.marker([v.lat, v.lng], { icon });
      marker.bindPopup(popupHtml(v), { maxWidth: 300, className: "om-map-popup" });
      marker.on("click", () => {
        onSelectSlug(v.slug);
      });
      cluster.addLayer(marker);
    }
  }, [props.venues, props.dayFilter, props.selectedSlug, props.onSelectSlug]);

  return (
    <div
      ref={containerRef}
      className="om-map-leaflet-root h-full min-h-[min(52vh,440px)] w-full rounded-xl border border-white/15 bg-zinc-900/40 sm:min-h-[320px] [&_.leaflet-control-attribution]:rounded-bl-lg [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-zoom]:overflow-hidden [&_.leaflet-control-zoom]:rounded-lg [&_.leaflet-control-zoom_a]:min-h-9 [&_.leaflet-control-zoom_a]:min-w-9 [&_.leaflet-control-zoom_a]:leading-9 [&_.leaflet-popup-content-wrapper]:rounded-xl [&_.leaflet-popup-content-wrapper]:shadow-lg [&_.leaflet-popup-tip]:shadow-none"
    />
  );
}
