"use client";

import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          theme?: "dark" | "light" | "auto";
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onMicstageTurnstileLoad?: () => void;
  }
}

/**
 * Cloudflare Turnstile widget. Renders only when a site key is provided.
 * Token is written into a hidden input named cf-turnstile-response.
 */
export function TurnstileField(props: { siteKey: string; resetSignal?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const inputId = useId();
  const tokenInputName = "cf-turnstile-response";

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !props.siteKey) return;

    let cancelled = false;

    function setToken(token: string) {
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      if (input) input.value = token;
    }

    function mount() {
      if (cancelled || !hostRef.current || !window.turnstile) return;
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
      hostRef.current.innerHTML = "";
      widgetIdRef.current = window.turnstile.render(hostRef.current, {
        sitekey: props.siteKey,
        theme: "dark",
        callback: setToken,
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
    );
    if (window.turnstile) {
      mount();
    } else if (existing) {
      window.onMicstageTurnstileLoad = mount;
      existing.addEventListener("load", mount);
    } else {
      window.onMicstageTurnstileLoad = mount;
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onMicstageTurnstileLoad&render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, [props.siteKey, props.resetSignal, inputId]);

  return (
    <div className="grid gap-2">
      <input id={inputId} type="hidden" name={tokenInputName} value="" readOnly />
      <div ref={hostRef} className="min-h-[65px]" />
      <p className="text-[11px] text-white/45">Protected by Cloudflare Turnstile (free).</p>
    </div>
  );
}
