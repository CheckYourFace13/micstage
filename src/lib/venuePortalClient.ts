"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { VenuePortalActionResult } from "@/lib/venuePortalActionResult";

/** Apply portal server-action navigation without `redirect()` (avoids noisy client fetch/redirect logs). */
export function useVenuePortalRedirect() {
  const router = useRouter();
  return useCallback(
    (result: VenuePortalActionResult) => {
      router.replace(result.redirect);
      router.refresh();
    },
    [router],
  );
}
