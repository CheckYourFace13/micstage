"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Hides site chrome for `?embed=1` lineup iframes without reading request
 * headers in the root layout (which would poison ISR / CDN caching).
 */
export function EmbedAwareChrome(props: { children: ReactNode }) {
  const [embed, setEmbed] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setEmbed(params.get("embed") === "1");
    } catch {
      setEmbed(false);
    }
  }, []);

  if (embed) return null;
  return <>{props.children}</>;
}
