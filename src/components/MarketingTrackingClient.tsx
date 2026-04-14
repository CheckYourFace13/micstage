"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  GA4_MEASUREMENT_ID,
  META_PIXEL_ID,
  trackMarketingEvent,
  trackPageView,
} from "@/lib/marketingTracking";
import { isAnalyticsDisabled } from "@/lib/productAnalytics";

function oncePerSession(key: string, fn: () => void) {
  try {
    if (sessionStorage.getItem(key) === "1") return;
    fn();
    sessionStorage.setItem(key, "1");
  } catch {
    // Ignore storage failures in strict/privacy contexts.
  }
}

export function MarketingTrackingClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPathRef = useRef<string>("");

  useEffect(() => {
    if (isAnalyticsDisabled()) return;
    const search = searchParams.toString();
    const key = search ? `${pathname}?${search}` : pathname;
    if (lastPathRef.current === key) return;
    lastPathRef.current = key;

    trackPageView(pathname, search);

    if (pathname === "/register/venue") {
      oncePerSession("trk:venue_signup_started", () => {
        trackMarketingEvent("venue_signup_started", { page_path: pathname });
      });
    }
    if (pathname === "/register/musician") {
      oncePerSession("trk:performer_signup_started", () => {
        trackMarketingEvent("performer_signup_started", { page_path: pathname });
      });
    }
    if (pathname === "/map") {
      trackMarketingEvent("map_page_viewed", { page_path: pathname });
    }
    if (pathname.startsWith("/venues/")) {
      trackMarketingEvent("open_mic_page_viewed", { page_path: pathname });
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (isAnalyticsDisabled()) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const eventEl = target?.closest("[data-track-event]") as HTMLElement | null;
      if (eventEl?.dataset.trackEvent) {
        trackMarketingEvent(eventEl.dataset.trackEvent as Parameters<typeof trackMarketingEvent>[0], {
          page_path: window.location.pathname,
        });
      }
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href") ?? "";
      if (!href) return;

      if (href === "/contact" || href.startsWith("/contact?")) {
        trackMarketingEvent("contact_click", { href });
      }

      if (href.startsWith("http://") || href.startsWith("https://")) {
        try {
          const url = new URL(href);
          if (url.origin !== window.location.origin) {
            trackMarketingEvent("outbound_link_click", { href: url.href, host: url.host });
          }
        } catch {
          // Ignore malformed URL.
        }
      }
    };

    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement | null;
      if (!form) return;
      const eventName = form.dataset.trackEvent;
      if (!eventName) return;
      trackMarketingEvent(eventName as Parameters<typeof trackMarketingEvent>[0], {
        page_path: window.location.pathname,
      });
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  if (isAnalyticsDisabled()) return null;

  return (
    <>
      {GA4_MEASUREMENT_ID ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA4_MEASUREMENT_ID}', { send_page_view: false });
            `}
          </Script>
        </>
      ) : null}

      {META_PIXEL_ID ? (
        <>
          <Script id="meta-pixel-init" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${META_PIXEL_ID}');
            `}
          </Script>
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      ) : null}
    </>
  );
}
