"use client";

import Link from "next/link";
import { useState } from "react";

export function ClaimListingForm(props: { listingSlug: string; listingName: string }) {
  const [contactName, setContactName] = useState("");
  const [role, setRole] = useState("host");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [desiredLoginEmail, setDesiredLoginEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactName.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`/claim/${encodeURIComponent(props.listingSlug)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: contactName.trim(),
          role: role.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          proofUrl: proofUrl.trim() || null,
          notes: notes.trim() || null,
          desiredLoginEmail: desiredLoginEmail.trim() || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(data.error ?? "Could not submit claim.");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Network error.");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-5">
        <h2 className="text-lg font-semibold text-white">Claim submitted</h2>
        <p className="mt-2 text-sm text-white/80">
          Thanks — we&apos;ll review your claim for {props.listingName} and email you at {email} with next steps.
        </p>
        <Link href={`/open-mics/${props.listingSlug}`} className="mt-4 inline-block text-sm text-[rgb(var(--om-neon))] underline">
          Back to listing
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid max-w-xl gap-4">
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Your name</span>
        <input required value={contactName} onChange={(e) => setContactName(e.target.value)} className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Your role</span>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white">
          <option value="host">Host / MC</option>
          <option value="owner">Venue owner</option>
          <option value="manager">Venue manager</option>
          <option value="staff">Staff</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Email</span>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Phone (optional)</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Venue website or social proof URL</span>
        <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://…" className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Notes</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Desired login email if different</span>
        <input type="email" value={desiredLoginEmail} onChange={(e) => setDesiredLoginEmail(e.target.value)} className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white" />
      </label>
      {error ? <p className="text-sm text-amber-200">{error}</p> : null}
      <button type="submit" disabled={status === "loading"} className="h-11 rounded-md bg-[rgb(var(--om-neon))] font-semibold text-black hover:brightness-110 disabled:opacity-60">
        {status === "loading" ? "Submitting…" : "Submit claim"}
      </button>
    </form>
  );
}
