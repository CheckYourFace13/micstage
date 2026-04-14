"use client";

import { track as vercelTrack } from "@vercel/analytics/react";
import { isAnalyticsDisabled } from "@/lib/productAnalytics";

export const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim() ?? "";
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ?? "";

type VercelProp = string | number | boolean | null | undefined;

export type MarketingEventName =
  | "venue_signup_started"
  | "venue_signup_completed"
  | "performer_signup_started"
  | "performer_signup_completed"
  | "open_mic_page_viewed"
  | "map_page_viewed"
  | "search_performed"
  | "filter_used"
  | "booking_started"
  | "booking_completed"
  | "booking_cancelled"
  | "contact_click"
  | "outbound_link_click";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

function canSendClientTracking(): boolean {
  return !isAnalyticsDisabled() && typeof window !== "undefined" && process.env.NODE_ENV === "production";
}

function sendGa4Event(eventName: string, params?: Record<string, unknown>) {
  if (!GA4_MEASUREMENT_ID) return;
  if (window.gtag) {
    window.gtag("event", eventName, params ?? {});
    return;
  }
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(["event", eventName, params ?? {}]);
}

function sendMetaEvent(eventName: string, params?: Record<string, unknown>) {
  if (!META_PIXEL_ID || !window.fbq) return;
  window.fbq("trackCustom", eventName, params ?? {});
}

export function trackMarketingEvent(name: MarketingEventName, params?: Record<string, unknown>) {
  if (!canSendClientTracking()) return;

  sendGa4Event(name, params);
  sendMetaEvent(name, params);
  const vercelProps: Record<string, VercelProp> | undefined = params
    ? Object.fromEntries(
        Object.entries(params).map(([k, v]) => [
          k,
          typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v == null ? v : String(v),
        ]),
      )
    : undefined;
  vercelTrack(name, vercelProps);

  // Lightweight mapping for common ad-platform optimization signals.
  if (window.gtag && GA4_MEASUREMENT_ID) {
    if (name === "search_performed") window.gtag("event", "search", params ?? {});
    if (name === "contact_click") window.gtag("event", "contact", params ?? {});
  }
  if (window.fbq && META_PIXEL_ID) {
    if (name === "booking_completed" || name === "venue_signup_completed" || name === "performer_signup_completed") {
      window.fbq("track", "CompleteRegistration", params ?? {});
    } else if (name === "booking_started") {
      window.fbq("track", "InitiateCheckout", params ?? {});
    } else if (name === "search_performed") {
      window.fbq("track", "Search", params ?? {});
    } else if (name === "contact_click") {
      window.fbq("track", "Contact", params ?? {});
    }
  }
}

export function trackPageView(pathname: string, search: string) {
  if (!canSendClientTracking()) return;
  const pagePath = search ? `${pathname}?${search}` : pathname;
  const pageLocation = `${window.location.origin}${pagePath}`;
  if (window.gtag && GA4_MEASUREMENT_ID) {
    window.gtag("event", "page_view", {
      page_path: pagePath,
      page_location: pageLocation,
    });
  } else if (GA4_MEASUREMENT_ID) {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push([
      "event",
      "page_view",
      {
        page_path: pagePath,
        page_location: pageLocation,
      },
    ]);
  }
  if (window.fbq && META_PIXEL_ID) {
    window.fbq("track", "PageView");
  }
}

/**
 * Placeholder for future conversion plumbing:
 * - Google Ads conversions can be added via gtag "conversion" events.
 * - Meta Conversions API should be server-side (not client-only) when implemented.
 */
export function trackFutureConversionPlaceholder(_name: string, _params?: Record<string, unknown>) {
  // Intentionally no-op until Ads/CAPI backends are configured.
}
