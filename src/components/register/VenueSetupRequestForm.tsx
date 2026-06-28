"use client";

import { useState } from "react";

export function VenueSetupRequestForm() {
  const [venueName, setVenueName] = useState("");
  const [city, setCity] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [openMicDay, setOpenMicDay] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!venueName.trim() || !email.trim()) return;
    setStatus("loading");
    try {
      const message = [
        openMicDay.trim() ? `Open mic day: ${openMicDay.trim()}` : null,
        notes.trim() || null,
      ]
        .filter(Boolean)
        .join("\n");

      const res = await fetch("/api/public/demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "REQUEST_VENUE",
          venueName: venueName.trim(),
          city: city.trim() || null,
          name: contactName.trim() || null,
          email: email.trim(),
          message: message || "Venue setup request from register page",
        }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
        Thanks — we received your request and will follow up by email to help set up your open mic.
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div>
        <p className="text-sm font-semibold text-white">Want us to set it up for you?</p>
        <p className="mt-1 text-xs text-white/60">
          No password needed — tell us about your room and we will help you get listed and bookable.
        </p>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Venue / open mic name</span>
        <input
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          required
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">City</span>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Your name</span>
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Open mic day (if known)</span>
        <input
          value={openMicDay}
          onChange={(e) => setOpenMicDay(e.target.value)}
          placeholder="e.g. Tuesday nights"
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="resize-y rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-white/40"
        />
      </label>
      {status === "error" ? (
        <p className="text-xs text-red-300">Could not send — try again or use the contact form.</p>
      ) : null}
      <button
        type="submit"
        disabled={status === "loading"}
        className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
      >
        {status === "loading" ? "Sending…" : "Request setup help"}
      </button>
    </form>
  );
}
