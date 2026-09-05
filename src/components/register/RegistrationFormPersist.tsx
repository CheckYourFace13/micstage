"use client";

import { useEffect } from "react";

/**
 * Preserves non-password registration fields across validation error redirects.
 */
export function RegistrationFormPersist(props: { formId: string }) {
  const { formId } = props;

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const key = `micstage:reg_draft:${formId}`;

    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const data = JSON.parse(raw) as Record<string, string>;
        for (const [name, value] of Object.entries(data)) {
          const el = form.elements.namedItem(name);
          if (!(el instanceof HTMLInputElement)) continue;
          if (el.type === "password" || el.type === "checkbox" || el.type === "hidden") continue;
          if (!el.value && value) el.value = value;
        }
      }
    } catch {
      // ignore
    }

    const persist = () => {
      const data: Record<string, string> = {};
      for (const el of Array.from(form.elements)) {
        if (!(el instanceof HTMLInputElement)) continue;
        if (!el.name || el.type === "password" || el.type === "checkbox" || el.type === "hidden") continue;
        data[el.name] = el.value;
      }
      try {
        sessionStorage.setItem(key, JSON.stringify(data));
      } catch {
        // ignore
      }
    };

    form.addEventListener("input", persist);
    form.addEventListener("submit", persist);
    return () => {
      form.removeEventListener("input", persist);
      form.removeEventListener("submit", persist);
    };
  }, [formId]);

  return null;
}
