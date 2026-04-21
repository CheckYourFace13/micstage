"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** When URL contains `?pdf=1`, opens the browser print dialog (user can save as PDF). */
export function MediaPrintOnQuery() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("pdf") !== "1") return;
    const id = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(id);
  }, [searchParams]);

  return null;
}
