"use client";

import { useEffect } from "react";

const GROWTH_LEAD_ID_RE = /^c[a-z0-9]{24}$/i;

/**
 * Advances growth-lead CLICKED without forcing the listing HTML path dynamic.
 * Fires once when `?growthLead=` is present.
 */
export function GrowthLeadClickBeacon() {
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("growthLead")?.trim() ?? "";
      if (!GROWTH_LEAD_ID_RE.test(raw)) return;
      void fetch("/api/public/growth-lead-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ growthLeadId: raw }),
        credentials: "same-origin",
        keepalive: true,
      });
    } catch {
      // ignore
    }
  }, []);

  return null;
}
