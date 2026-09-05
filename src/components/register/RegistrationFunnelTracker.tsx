"use client";

import { useEffect, useRef } from "react";
import { oncePerSession } from "@/lib/conversionAttribution";
import { trackMarketingEvent, type MarketingEventName } from "@/lib/marketingTracking";

type Role = "venue" | "host" | "performer";

const PAGE_VIEW: Record<Role, MarketingEventName> = {
  venue: "registration_page_view_venue",
  host: "registration_page_view_host",
  performer: "registration_page_view_performer",
};

const FORM_STARTED: Record<Role, MarketingEventName> = {
  venue: "registration_form_started_venue",
  host: "registration_form_started_host",
  performer: "registration_form_started_performer",
};

const FORM_SUBMITTED: Record<Role, MarketingEventName> = {
  venue: "registration_submitted_venue",
  host: "registration_submitted_host",
  performer: "registration_submitted_performer",
};

/**
 * Fires registration funnel events: page_view → form_started → submitted.
 * Completion events remain on post-signup redirects (joined=…).
 */
export function RegistrationFunnelTracker(props: { role: Role; formSelector?: string }) {
  const { role, formSelector = "form[method='post']" } = props;
  const startedRef = useRef(false);

  useEffect(() => {
    oncePerSession(`trk:reg_page_view:${role}`, () => {
      trackMarketingEvent(PAGE_VIEW[role], { role, page_path: window.location.pathname });
    });

    const form = document.querySelector(formSelector) as HTMLFormElement | null;
    if (!form) return;

    const onFocus = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      oncePerSession(`trk:reg_form_started:${role}`, () => {
        trackMarketingEvent(FORM_STARTED[role], { role, page_path: window.location.pathname });
      });
    };

    const onSubmit = () => {
      trackMarketingEvent(FORM_SUBMITTED[role], { role, page_path: window.location.pathname });
    };

    form.addEventListener("focusin", onFocus);
    form.addEventListener("submit", onSubmit);
    return () => {
      form.removeEventListener("focusin", onFocus);
      form.removeEventListener("submit", onSubmit);
    };
  }, [role, formSelector]);

  return null;
}
