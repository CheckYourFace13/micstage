"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function SiteFooterAdminLink() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/public/auth-ui", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { role?: string };
        if (!cancelled && data.role === "admin") setShow(true);
      } catch {
        // Anonymous footer stays as SSR'd.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;
  return (
    <Link className="hover:text-white" href="/internal/admin">
      Admin
    </Link>
  );
}
