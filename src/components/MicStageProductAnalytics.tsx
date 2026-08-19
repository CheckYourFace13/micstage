"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { oncePerSession } from "@/lib/conversionAttribution";
import {
  HOST_MILESTONE_FIRST_NIGHT,
  HOST_MILESTONE_FIRST_SERIES,
  HOST_MILESTONE_SECOND_VENUE,
  isAnalyticsDisabled,
  JOINED_HOST,
  JOINED_MUSICIAN,
  JOINED_VENUE,
  PRODUCT_ANALYTICS_QS,
} from "@/lib/productAnalytics";
import { trackConversionEvent, trackMarketingEvent } from "@/lib/marketingTracking";

/**
 * Fires low-noise product events from ephemeral query params (set by server actions),
 * then removes those params so refreshes don't duplicate counts.
 */
export function MicStageProductAnalytics() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSerialized = useRef<string | null>(null);

  useEffect(() => {
    if (isAnalyticsDisabled()) return;

    const serialized = searchParams.toString();
    if (lastSerialized.current === serialized) return;
    lastSerialized.current = serialized;

    const booked = searchParams.get(PRODUCT_ANALYTICS_QS.booked);
    const cancelled = searchParams.get(PRODUCT_ANALYTICS_QS.cancelled);
    const joined = searchParams.get(PRODUCT_ANALYTICS_QS.joined);
    const hostMs = searchParams.get(PRODUCT_ANALYTICS_QS.hostMilestone);

    let dirty = false;
    const next = new URLSearchParams(searchParams.toString());
    const send = process.env.NODE_ENV === "production";

    if (booked === "1") {
      if (send) trackMarketingEvent("booking_completed");
      next.delete(PRODUCT_ANALYTICS_QS.booked);
      dirty = true;
    }
    if (cancelled === "1") {
      if (send) trackMarketingEvent("booking_cancelled");
      next.delete(PRODUCT_ANALYTICS_QS.cancelled);
      dirty = true;
    }
    if (joined === JOINED_MUSICIAN) {
      if (send) {
        oncePerSession("conv:performer_signup_complete", () => {
          trackConversionEvent("performer_signup_complete");
        });
      }
      next.delete(PRODUCT_ANALYTICS_QS.joined);
      dirty = true;
    } else if (joined === JOINED_VENUE) {
      if (send) {
        oncePerSession("conv:venue_registration_complete", () => {
          trackConversionEvent("venue_registration_complete");
        });
      }
      next.delete(PRODUCT_ANALYTICS_QS.joined);
      dirty = true;
    } else if (joined === JOINED_HOST) {
      if (send) {
        oncePerSession("conv:host_registration_complete", () => {
          trackConversionEvent("host_registration_complete");
        });
      }
      next.delete(PRODUCT_ANALYTICS_QS.joined);
      dirty = true;
    }

    if (hostMs) {
      for (const token of hostMs.split(",").map((s) => s.trim()).filter(Boolean)) {
        if (token === HOST_MILESTONE_FIRST_SERIES) {
          if (send) {
            oncePerSession("conv:host_first_series", () => {
              trackConversionEvent("host_first_series");
            });
          }
        } else if (token === HOST_MILESTONE_FIRST_NIGHT) {
          if (send) {
            oncePerSession("conv:host_first_night", () => {
              trackConversionEvent("host_first_night");
            });
          }
        } else if (token === HOST_MILESTONE_SECOND_VENUE) {
          if (send) {
            oncePerSession("conv:host_second_venue", () => {
              trackConversionEvent("host_second_venue", { multi_venue: true });
            });
          }
        }
      }
      next.delete(PRODUCT_ANALYTICS_QS.hostMilestone);
      dirty = true;
    }

    if (dirty) {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  return null;
}
