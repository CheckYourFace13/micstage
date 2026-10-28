"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ClaimAuthorityRole } from "@/lib/publicListings/claimAutoApproval";
import { trackConversionEvent, trackMarketingEvent } from "@/lib/marketingTracking";
import { oncePerSession } from "@/lib/conversionAttribution";

const ROLES: { value: ClaimAuthorityRole; label: string; next: string; funnel: "role_selected_venue" | "role_selected_host" }[] = [
  {
    value: "owner",
    label: "I'm the venue",
    next: "You get this listing and can fix the schedule.",
    funnel: "role_selected_venue",
  },
  {
    value: "authorized_event_host",
    label: "I'm the host",
    next: "You can run this night without owning the room.",
    funnel: "role_selected_host",
  },
];

export function InstantClaimForm(props: {
  listingSlug: string;
  listingName: string;
  /** Masked display. Full invited email stays on the server session. */
  invitedEmailMasked: string;
  emailConfirmedFromInvite?: boolean;
  address: string;
  cityLine?: string | null;
  evidenceSummary?: string | null;
  authorityAffirmation: string;
}) {
  const router = useRouter();
  const emailKnown = Boolean(props.emailConfirmedFromInvite);
  const [contactName, setContactName] = useState("");
  const [role, setRole] = useState<ClaimAuthorityRole | "">("");
  const [loginEmail, setLoginEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [manualReason, setManualReason] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    oncePerSession(`conv:venue_claim_start:${props.listingSlug}`, () => {
      trackMarketingEvent("claim_page_reached", { listing_slug: props.listingSlug });
      trackConversionEvent("venue_claim_start", { listing_slug: props.listingSlug });
    });
  }, [props.listingSlug]);

  function beacon(event: "role_selected_venue" | "role_selected_host" | "claim_form_started") {
    void fetch("/api/claim/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, listingSlug: props.listingSlug }),
    }).catch(() => undefined);
  }

  function markStarted() {
    if (startedRef.current) return;
    startedRef.current = true;
    trackMarketingEvent("claim_form_started", { listing_slug: props.listingSlug });
    beacon("claim_form_started");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactName.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!role) {
      setError("Choose whether you are the venue or the host.");
      return;
    }
    if (!emailKnown && !loginEmail.trim()) {
      setError("Enter the email from your invitation.");
      return;
    }
    if (!consent) {
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
          loginEmail: emailKnown ? undefined : loginEmail.trim(),
          authorityConfirmed: true,
          termsAccepted: true,
          privacyAccepted: true,
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
        trackConversionEvent("venue_claim_complete", {
          listing_slug: props.listingSlug,
          decision: "auto",
        });
        router.push(`${data.activationPath}?claimed=1`);
        return;
      }
      trackMarketingEvent("claim_submit_success", { listing_slug: props.listingSlug, decision: "manual" });
      trackMarketingEvent("claim_manual_review", { listing_slug: props.listingSlug });
      trackConversionEvent("venue_claim_complete", {
        listing_slug: props.listingSlug,
        decision: "manual",
      });
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

  const placeLine = props.cityLine && props.address.toLowerCase().includes(props.cityLine.toLowerCase())
    ? null
    : props.cityLine;

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      onFocusCapture={markStarted}
      className="grid max-w-xl gap-4 pb-24 sm:pb-0"
      data-track-event="claim_submitted"
    >
      <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-4">
        <h1 className="om-heading text-2xl text-white sm:text-3xl">Claim this open mic</h1>
        <p className="mt-2 text-lg font-semibold text-white">{props.listingName}</p>
        {placeLine ? <p className="mt-1 text-sm text-white/70">{placeLine}</p> : null}
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
          autoCapitalize="words"
        />
      </label>

      <fieldset className="grid gap-2 text-sm">
        <legend className="text-white/80">Your role</legend>
        {ROLES.map((r) => (
          <label
            key={r.value}
            className={`flex min-h-14 items-start gap-3 rounded-md border px-3 py-2 text-base text-white ${
              role === r.value ? "border-[rgb(var(--om-neon))] bg-white/10" : "border-white/15 bg-black/40"
            }`}
          >
            <input
              type="radio"
              name="claim-role"
              value={r.value}
              checked={role === r.value}
              onChange={() => {
                setRole(r.value);
                trackMarketingEvent("authority_confirmed", { listing_slug: props.listingSlug, role: r.value });
                beacon(r.funnel);
              }}
              className="mt-1 h-5 w-5 shrink-0"
            />
            <span>
              <span className="block font-semibold">{r.label}</span>
              <span className="mt-0.5 block text-sm text-white/65">{r.next}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {emailKnown ? (
        <p className="text-sm text-white/70">
          Invited email: <span className="font-medium text-white">{props.invitedEmailMasked}</span>
          <span className="mt-0.5 block text-xs text-white/45">Already confirmed from your invite link.</span>
        </p>
      ) : (
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
          <span className="text-xs text-white/45">Use {props.invitedEmailMasked}.</span>
        </label>
      )}

      <label className="flex items-start gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (e.target.checked) {
              trackMarketingEvent("authority_confirmed", { listing_slug: props.listingSlug });
              trackMarketingEvent("terms_confirmed", { listing_slug: props.listingSlug });
              trackMarketingEvent("privacy_confirmed", { listing_slug: props.listingSlug });
            }
          }}
          className="mt-1 h-5 w-5 shrink-0"
          required
        />
        <span data-claim-authority="required">
          Yes — I am authorized to manage this open mic and accept the{" "}
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

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-black/90 p-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex h-12 w-full items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-base font-semibold text-black disabled:opacity-60"
        >
          {status === "loading" ? "Claiming…" : "Claim this open mic"}
        </button>
      </div>
    </form>
  );
}
