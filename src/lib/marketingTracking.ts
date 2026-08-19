"use client";

import { track as vercelTrack } from "@vercel/analytics/react";
import { conversionEventParams } from "@/lib/conversionAttribution";
import { isAnalyticsDisabled } from "@/lib/productAnalytics";

export const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim() ?? "";
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ?? "";

type VercelProp = string | number | boolean | null | undefined;

/** GA4 conversion events (canonical funnel names). */
export type ConversionEventName =
  | "listing_claim_cta_click"
  | "venue_claim_start"
  | "venue_claim_complete"
  | "venue_registration_complete"
  | "host_registration_complete"
  | "host_first_series"
  | "host_first_night"
  | "host_second_venue"
  | "performer_signup_complete"
  | "host_cta_click";

export type MarketingEventName =
  | ConversionEventName
  | "homepage_cta_find"
  | "homepage_cta_host"
  | "venue_signup_started"
  | "venue_signup_completed"
  | "performer_signup_started"
  | "performer_signup_completed"
  | "promoter_signup_started"
  | "promoter_signup_completed"
  | "promoter_welcome_viewed"
  | "promoter_mic_connected"
  | "claim_started"
  | "claim_submitted"
  | "claim_email_opened"
  | "claim_page_reached"
  | "claim_form_started"
  | "authority_confirmed"
  | "terms_confirmed"
  | "privacy_confirmed"
  | "claim_submit_attempt"
  | "claim_submit_success"
  | "claim_auto_approved"
  | "claim_manual_review"
  | "schedule_confirmed"
  | "performer_signups_enabled"
  | "listing_improvement_completed"
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

  if (window.gtag && GA4_MEASUREMENT_ID) {
    if (name === "search_performed") window.gtag("event", "search", params ?? {});
    if (name === "contact_click") window.gtag("event", "contact", params ?? {});
  }
  if (window.fbq && META_PIXEL_ID) {
    const registrationEvents: MarketingEventName[] = [
      "booking_completed",
      "venue_signup_completed",
      "venue_registration_complete",
      "performer_signup_completed",
      "performer_signup_complete",
      "host_registration_complete",
    ];
    if (registrationEvents.includes(name)) {
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

/** Fires a canonical conversion event with session attribution dimensions. */
export function trackConversionEvent(name: ConversionEventName, params?: Record<string, unknown>) {
  trackMarketingEvent(name, conversionEventParams(params));
}

const CONVERSION_EVENT_NAMES = new Set<string>([
  "listing_claim_cta_click",
  "venue_claim_start",
  "venue_claim_complete",
  "venue_registration_complete",
  "host_registration_complete",
  "host_first_series",
  "host_first_night",
  "host_second_venue",
  "performer_signup_complete",
  "host_cta_click",
]);

export function trackTrackedElementEvent(eventName: string, params?: Record<string, unknown>) {
  if (CONVERSION_EVENT_NAMES.has(eventName)) {
    trackConversionEvent(eventName as ConversionEventName, params);
    return;
  }
  trackMarketingEvent(eventName as MarketingEventName, params);
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
