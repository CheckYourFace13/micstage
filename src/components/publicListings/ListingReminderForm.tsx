"use client";

import { useState } from "react";

export function ListingReminderForm(props: { listingSlug: string; city?: string | null; region?: string | null }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email.");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/public/demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "REMINDER_NEARBY",
          email: trimmed,
          listingSlug: props.listingSlug,
          city: props.city,
          region: props.region,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(data.error ?? "Could not save request.");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Network error.");
    }
  }

  if (status === "done") {
    return <p className="text-sm text-emerald-100">You&apos;re on the list — we&apos;ll email when this listing is updated or bookable.</p>;
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="grid flex-1 gap-1 text-sm">
        <span className="text-white/75">Email for reminders</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white"
        />
      </label>
      <button
        type="submit"
        disabled={status === "loading"}
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-60"
      >
        {status === "loading" ? "Saving…" : "Get reminders"}
      </button>
      {error ? <p className="w-full text-sm text-amber-200">{error}</p> : null}
    </form>
  );
}
