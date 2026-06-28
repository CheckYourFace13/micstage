"use client";

import { useState } from "react";
import Link from "next/link";

export function EmptyDiscoveryActions(props: { context?: string }) {
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  async function requestCity(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      await fetch("/api/public/demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "REQUEST_CITY",
          email: email.trim() || null,
          city: city.trim() || null,
          message: props.context ?? null,
        }),
      });
      setStatus("done");
    } catch {
      setStatus("idle");
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4 md:p-5">
      <p className="text-sm font-semibold text-white">No open mic listings near this search yet.</p>
      <p className="mt-1 text-xs text-white/60 md:text-sm">
        Request this city, suggest a venue, or get alerts when listings are added.
      </p>
      <ul className="mt-3 grid gap-2 text-sm">
        <li>
          <Link href="/contact?category=partnership" className="text-[rgb(var(--om-neon))] underline hover:brightness-110">
            Suggest a venue
          </Link>
        </li>
        <li>
          <Link href="/find-open-mics" className="text-[rgb(var(--om-neon))] underline hover:brightness-110">
            Browse closest verified listings
          </Link>
        </li>
        <li>
          <Link href="/register/venue" className="text-[rgb(var(--om-neon))] underline hover:brightness-110">
            List or claim your open mic
          </Link>
        </li>
      </ul>
      {status === "done" ? (
        <p className="mt-3 text-sm text-emerald-100">Thanks — we&apos;ll prioritize that area.</p>
      ) : (
        <form onSubmit={(e) => void requestCity(e)} className="mt-4 grid gap-2 border-t border-white/10 pt-4">
          <p className="text-xs font-medium text-white/75">Request this city</p>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City or metro"
            className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-sm text-white"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-sm text-white"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="h-10 rounded-md border border-white/20 bg-white/10 text-sm font-semibold text-white hover:bg-white/15"
          >
            {status === "loading" ? "Sending…" : "Request alerts for this area"}
          </button>
        </form>
      )}
    </div>
  );
}
