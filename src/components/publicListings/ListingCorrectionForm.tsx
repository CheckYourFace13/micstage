"use client";

import { useState } from "react";

export function ListingCorrectionForm(props: { listingSlug: string; listingName: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState("correction");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please describe what should change.");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`/open-mics/${encodeURIComponent(props.listingSlug)}/correction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, email: email.trim() || null, kind, message: message.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(data.error ?? "Could not submit. Try again.");
        return;
      }
      setStatus("done");
      setMessage("");
    } catch {
      setStatus("error");
      setError("Network error. Try again.");
    }
  }

  if (status === "done") {
    return (
      <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
        Thanks — we received your note about {props.listingName}. We review corrections regularly.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-3">
      <label className="grid gap-1 text-sm">
        <span className="text-white/75">What needs updating?</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white"
        >
          <option value="correction">Suggest a correction</option>
          <option value="outdated">Report outdated info</option>
          <option value="perform_here">I perform here</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/75">Details</span>
        <textarea
          required
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Day/time, host name, signup method, closed permanently, etc."
          className="rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white placeholder:text-white/40"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-white/75">Your name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-white/75">Email (optional)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white"
          />
        </label>
      </div>
      {error ? <p className="text-sm text-amber-200">{error}</p> : null}
      <button
        type="submit"
        disabled={status === "loading"}
        className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
      >
        {status === "loading" ? "Sending…" : "Submit"}
      </button>
    </form>
  );
}
