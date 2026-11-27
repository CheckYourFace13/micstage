"use client";

import { useEffect, useState, type ReactElement } from "react";
import { ContactForm } from "./ContactForm";

/** Reads `?category=` / `?listing=` in the browser so the contact shell can ISR. */
export function ContactQueryDefaults(props: { children?: ReactElement }) {
  const [defaults, setDefaults] = useState<{ category?: string; details?: string }>({});

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const category = sp.get("category")?.trim() || undefined;
      const listing = sp.get("listing")?.trim();
      setDefaults({
        category,
        details: listing ? `Listing: ${listing}\n\n` : undefined,
      });
    } catch {
      // ignore
    }
  }, []);

  // children prop unused — keep ContactForm here so defaults apply after mount
  void props.children;
  return <ContactForm defaultCategory={defaults.category} defaultDetails={defaults.details} />;
}
