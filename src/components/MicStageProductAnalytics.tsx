"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { track } from "@vercel/analytics/react";
import {
  isAnalyticsDisabled,
  JOINED_MUSICIAN,
  JOINED_VENUE,
  PRODUCT_ANALYTICS_QS,
} from "@/lib/productAnalytics";

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

    let dirty = false;
    const next = new URLSearchParams(searchParams.toString());
    const send = process.env.NODE_ENV === "production";

    if (booked === "1") {
      if (send) track("Booking Completed");
      next.delete(PRODUCT_ANALYTICS_QS.booked);
      dirty = true;
    }
    if (cancelled === "1") {
      if (send) track("Booking Cancelled");
      next.delete(PRODUCT_ANALYTICS_QS.cancelled);
      dirty = true;
    }
    if (joined === JOINED_MUSICIAN) {
      if (send) track("Artist Signup");
      next.delete(PRODUCT_ANALYTICS_QS.joined);
      dirty = true;
    } else if (joined === JOINED_VENUE) {
      if (send) track("Venue Signup");
      next.delete(PRODUCT_ANALYTICS_QS.joined);
      dirty = true;
    }

    if (dirty) {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  return null;
}
