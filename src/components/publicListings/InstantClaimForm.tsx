"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ClaimAuthorityRole } from "@/lib/publicListings/claimAutoApproval";
import { trackMarketingEvent } from "@/lib/marketingTracking";

const ROLES: { value: ClaimAuthorityRole; label: string }[] = [
  { value: "owner", label: "I own this venue" },
  { value: "manager", label: "I manage this venue" },
  { value: "authorized_employee", label: "I work here and can manage the open mic" },
  { value: "authorized_event_host", label: "I host the open mic here" },
];

export function InstantClaimForm(props: {
  listingSlug: string;
  listingName: string;
  /** Masked only — never pass the full invited address to the client. */
  invitedEmailMasked: string;
  address: string;
  cityLine?: string | null;
  evidenceSummary?: string | null;
  authorityAffirmation: string;
}) {
  const router = useRouter();
  const [contactName, setContactName] = useState("");
  const [role, setRole] = useState<ClaimAuthorityRole>("owner");
  const [loginEmail, setLoginEmail] = useState("");
  const [authority, setAuthority] = useState(false);
  const [legal, setLegal] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [manualReason, setManualReason] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    trackMarketingEvent("claim_page_reached", { listing_slug: props.listingSlug });
  }, [props.listingSlug]);

  function markStarted() {
    if (startedRef.current) return;
    startedRef.current = true;
    trackMarketingEvent("claim_form_started", { listing_slug: props.listingSlug });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactName.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!loginEmail.trim()) {
      setError("Enter the email from your invitation.");
      return;
    }
    if (!authority || !legal) {
      setError("Confirm you can manage this listing and accept Terms and Privacy.");
      return;
    }
    trackMarketingEvent("claim_submit_attempt", { listing_slug: props.listingSlug });
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/claim/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingSlug: props.listingSlug,
          contactName: contactName.trim(),
          role,
          loginEmail: loginEmail.trim(),
          authorityConfirmed: authority,
          termsAccepted: legal,
          privacyAccepted: legal,
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
        setError(data.error ?? "Could not complete claim. Check the invited email and try again.");
        return;
      }
      if (data.decision === "AUTO_APPROVED" && data.activationPath) {
        trackMarketingEvent("claim_submit_success", { listing_slug: props.listingSlug, decision: "auto" });
        trackMarketingEvent("claim_auto_approved", { listing_slug: props.listingSlug });
        router.push(`${data.activationPath}?claimed=1`);
        return;
      }
      trackMarketingEvent("claim_submit_success", { listing_slug: props.listingSlug, decision: "manual" });
      trackMarketingEvent("claim_manual_review", { listing_slug: props.listingSlug });
      setManualReason(data.reason ?? "manual_review");
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Network error — try again in a moment.");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-5">
        <h2 className="text-lg font-semibold text-white">Thanks — we got your claim</h2>
        <p className="mt-2 text-sm text-white/80">
          Your claim for {props.listingName} needs a short human review
          {manualReason ? ` (${manualReason.replace(/_/g, " ")})` : ""}. We&apos;ll email you with next steps.
        </p>
        <Link href={`/open-mics/${props.listingSlug}`} className="mt-4 inline-block text-sm text-[rgb(var(--om-neon))] underline">
          Back to listing
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      onFocusCapture={markStarted}
      className="grid max-w-xl gap-4"
      data-track-event="claim_submitted"
    >
      <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-4">
        <h1 className="om-heading text-3xl text-white">Claim this free listing</h1>
        <p className="mt-2 text-lg font-semibold text-white">{props.listingName}</p>
        {props.cityLine ? <p className="mt-1 text-sm text-white/70">{props.cityLine}</p> : null}
        <p className="mt-1 text-sm text-white/60">{props.address}</p>
        <p className="mt-3 text-xs text-white/55">
          Claiming your listing does not turn on online signups or booking. You can update the schedule and details later.
        </p>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Your name</span>
        <input
          required
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          className="h-12 rounded-md border border-white/15 bg-black/40 px-3 text-base text-white"
          autoComplete="name"
          enterKeyHint="next"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Your role</span>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as ClaimAuthorityRole);
            trackMarketingEvent("authority_confirmed", { listing_slug: props.listingSlug, role: e.target.value });
          }}
          className="h-12 rounded-md border border-white/15 bg-black/40 px-3 text-base text-white"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Invited email</span>
        <input
          required
          type="email"
          inputMode="email"
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
          placeholder={props.invitedEmailMasked}
          className="h-12 rounded-md border border-white/15 bg-black/40 px-3 text-base text-white"
          autoComplete="email"
          enterKeyHint="done"
        />
        <span className="text-xs text-white/45">
          Use {props.invitedEmailMasked}. A different email goes to a short review.
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={authority}
          onChange={(e) => {
            setAuthority(e.target.checked);
            if (e.target.checked) trackMarketingEvent("authority_confirmed", { listing_slug: props.listingSlug });
          }}
          className="mt-1 h-5 w-5 shrink-0"
          required
        />
        <span data-claim-authority="required">Yes — I am authorized to manage this open mic.</span>
      </label>

      <label className="flex items-start gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={legal}
          onChange={(e) => {
            setLegal(e.target.checked);
            if (e.target.checked) {
              trackMarketingEvent("terms_confirmed", { listing_slug: props.listingSlug });
              trackMarketingEvent("privacy_confirmed", { listing_slug: props.listingSlug });
            }
          }}
          className="mt-1 h-5 w-5 shrink-0"
          required
        />
        <span>
          I accept the{" "}
          <Link href="/terms" className="underline text-[rgb(var(--om-neon))]" target="_blank">
            Terms
          </Link>{" "}
          and{" "}
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
        className="inline-flex h-12 w-full items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-base font-semibold text-black disabled:opacity-60"
      >
        {status === "loading" ? "Claiming…" : "Claim this free listing"}
      </button>
    </form>
  );
}
