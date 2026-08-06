"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClaimAuthorityRole } from "@/lib/publicListings/claimAutoApproval";

const ROLES: { value: ClaimAuthorityRole; label: string }[] = [
  { value: "owner", label: "Venue owner" },
  { value: "manager", label: "Venue manager" },
  { value: "authorized_employee", label: "Authorized employee" },
  { value: "authorized_event_host", label: "Authorized event host" },
];

export function InstantClaimForm(props: {
  listingSlug: string;
  listingName: string;
  rawToken: string;
  invitedEmail: string;
  address: string;
  evidenceSummary?: string | null;
}) {
  const router = useRouter();
  const [contactName, setContactName] = useState("");
  const [role, setRole] = useState<ClaimAuthorityRole>("owner");
  const [loginEmail, setLoginEmail] = useState(props.invitedEmail);
  const [authority, setAuthority] = useState(false);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [manualReason, setManualReason] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactName.trim()) {
      setError("Name is required.");
      return;
    }
    if (!authority || !terms || !privacy) {
      setError("Confirm authority and accept Terms and Privacy to continue.");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/claim/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawToken: props.rawToken,
          listingSlug: props.listingSlug,
          contactName: contactName.trim(),
          role,
          loginEmail: loginEmail.trim(),
          authorityConfirmed: authority,
          termsAccepted: terms,
          privacyAccepted: privacy,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        decision?: string;
        reason?: string;
        activationPath?: string;
      };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(data.error ?? "Could not complete claim.");
        return;
      }
      if (data.decision === "AUTO_APPROVED" && data.activationPath) {
        router.push(data.activationPath);
        return;
      }
      setManualReason(data.reason ?? "manual_review");
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Network error.");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-5">
        <h2 className="text-lg font-semibold text-white">Claim received — manual review</h2>
        <p className="mt-2 text-sm text-white/80">
          Thanks. Your claim for {props.listingName} needs a short human review
          {manualReason ? ` (${manualReason.replace(/_/g, " ")})` : ""}. We&apos;ll email {loginEmail} with next steps.
          No account was created without this confirmation.
        </p>
        <Link href={`/open-mics/${props.listingSlug}`} className="mt-4 inline-block text-sm text-[rgb(var(--om-neon))] underline">
          Back to listing
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid max-w-xl gap-4">
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/75">
        <p>
          <span className="font-semibold text-white">{props.listingName}</span>
        </p>
        <p className="mt-1">{props.address}</p>
        {props.evidenceSummary ? <p className="mt-2 text-white/60">{props.evidenceSummary}</p> : null}
        <p className="mt-3 text-white/55">
          You received this invitation because we verified this open mic and found a strong contact match for your venue.
          Claiming is free. No MicStage account exists until you submit this form.
        </p>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Your name</span>
        <input
          required
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Your role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ClaimAuthorityRole)}
          className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Login email</span>
        <input
          required
          type="email"
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
          className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-white"
        />
        <span className="text-xs text-white/45">
          Must match the invited address for automatic approval. Changing it sends the claim to manual review.
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-white/80">
        <input type="checkbox" checked={authority} onChange={(e) => setAuthority(e.target.checked)} className="mt-1" />
        <span>I confirm I am authorized to manage this open mic listing for the venue.</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-white/80">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1" />
        <span>
          I accept the{" "}
          <Link href="/terms" className="underline text-[rgb(var(--om-neon))]" target="_blank">
            Terms of Service
          </Link>
          .
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-white/80">
        <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} className="mt-1" />
        <span>
          I accept the{" "}
          <Link href="/privacy" className="underline text-[rgb(var(--om-neon))]" target="_blank">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <button
        type="submit"
        disabled={status === "loading"}
        className="inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-4 font-semibold text-black disabled:opacity-60"
      >
        {status === "loading" ? "Submitting…" : "Claim and activate"}
      </button>
    </form>
  );
}
