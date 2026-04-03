"use client";

import { useActionState, useState } from "react";
import { submitVenueChangeRequest, type VenueChangeRequestState } from "./changeRequestActions";

const initial: VenueChangeRequestState = { status: "idle" };

type Props = {
  defaultEmail: string;
  /** Compact control + anchored panel for `SiteHeader` (venue users). */
  variant?: "default" | "header";
};

function VenueChangeRequestFormInner({
  defaultEmail,
  onSendAnother,
  variant = "default",
}: Props & { onSendAnother: () => void }) {
  const [state, formAction, pending] = useActionState(submitVenueChangeRequest, initial);
  const isHeader = variant === "header";

  if (state.status === "success") {
    const boxClass = isHeader
      ? "max-w-[min(18rem,calc(100vw-6rem))] shrink-0 rounded-md border border-emerald-500/40 bg-emerald-950/50 px-2 py-1.5 text-[10px] leading-snug text-emerald-100 sm:max-w-xs sm:text-[11px]"
      : "rounded-md border border-emerald-500/40 bg-emerald-950/35 px-3 py-2 text-xs text-emerald-100";
    return (
      <div className={isHeader ? "z-[60] shrink-0" : ""}>
        <div className={boxClass} role="status">
          <span className="font-semibold text-white">Request sent.</span>{" "}
          <span className="text-white/85">We&apos;ll follow up by email when we can.</span>
          {state.devLogged ? (
            <span className="mt-1 block text-white/55">
              (Dev: logged to server — set MICSTAGE_CONTACT_INBOX and RESEND_API_KEY to email for real.)
            </span>
          ) : null}
          <button
            type="button"
            onClick={onSendAnother}
            className="mt-1.5 block text-left text-[rgb(var(--om-neon))] underline hover:brightness-110"
          >
            Send another request
          </button>
        </div>
      </div>
    );
  }

  const detailsClass = isHeader
    ? "group relative z-[60] rounded-md border border-white/15 bg-white/[0.05] backdrop-blur-sm open:border-[rgb(var(--om-neon))]/40 open:bg-white/[0.08]"
    : "group relative rounded-md border border-white/20 bg-white/[0.06] open:border-[rgb(var(--om-neon))]/40 open:bg-white/[0.08]";

  const summaryClass = isHeader
    ? "cursor-pointer list-none px-2 py-1 text-[11px] font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden sm:text-xs"
    : "cursor-pointer list-none px-3 py-2 text-sm font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden";

  const panelClass = isHeader
    ? "absolute right-0 top-[calc(100%+0.35rem)] z-[70] w-[min(calc(100vw-1.5rem),26rem)] max-h-[min(85vh,36rem)] overflow-y-auto overscroll-contain rounded-lg border border-white/15 bg-[rgba(0,0,0,0.97)] p-3 shadow-2xl backdrop-blur-md sm:w-[28rem]"
    : "border-t border-white/10 px-3 pb-3 pt-3";

  return (
    <details className={detailsClass}>
      <summary className={summaryClass}>
        <span className="text-[rgb(var(--om-neon))] group-open:text-white">Update / change request</span>
        {!isHeader ? <span className="ml-2 font-normal text-white/55">— MicStage support</span> : null}
      </summary>
      <div className={panelClass}>
        <p className="mb-3 text-xs leading-relaxed text-white/60">
          Request listing updates, schedule fixes, or other changes.{" "}
          <strong className="font-medium text-white/80">Copy the full URL</strong> from your browser&apos;s address bar for the
          page that needs changing (select the bar, copy, paste below).
        </p>
        <form action={formAction} className="grid max-w-lg gap-3">
          {state.status === "error" && state.message ? (
            <p className="rounded-md border border-red-500/40 bg-red-950/35 px-3 py-2 text-xs text-red-100" role="alert">
              {state.message}
            </p>
          ) : null}

          <label className="grid gap-1 text-xs">
            <span className="text-white/75">Your email (for replies)</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={defaultEmail}
              disabled={pending}
              className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-sm text-white placeholder:text-white/35 disabled:opacity-50"
              aria-invalid={state.status === "error" && state.fieldErrors?.email ? true : undefined}
            />
            {state.status === "error" && state.fieldErrors?.email ? (
              <span className="text-red-300">{state.fieldErrors.email}</span>
            ) : null}
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-white/75">Subject</span>
            <input
              name="subject"
              type="text"
              required
              maxLength={200}
              disabled={pending}
              placeholder="e.g. Wrong hours on public lineup"
              className="h-10 rounded-md border border-white/15 bg-black/40 px-3 text-sm text-white placeholder:text-white/35 disabled:opacity-50"
              aria-invalid={state.status === "error" && state.fieldErrors?.subject ? true : undefined}
            />
            {state.status === "error" && state.fieldErrors?.subject ? (
              <span className="text-red-300">{state.fieldErrors.subject}</span>
            ) : null}
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-white/75">Page URL</span>
            <input
              name="pageUrl"
              type="text"
              required
              maxLength={2000}
              disabled={pending}
              placeholder="https://… or /venues/your-venue/lineup/…"
              className="h-10 rounded-md border border-white/15 bg-black/40 px-3 font-mono text-sm text-white placeholder:text-white/35 disabled:opacity-50"
              aria-invalid={state.status === "error" && state.fieldErrors?.pageUrl ? true : undefined}
            />
            {state.status === "error" && state.fieldErrors?.pageUrl ? (
              <span className="text-red-300">{state.fieldErrors.pageUrl}</span>
            ) : null}
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-white/75">What should we change?</span>
            <textarea
              name="details"
              required
              rows={5}
              maxLength={10_000}
              disabled={pending}
              placeholder="Be specific: what’s wrong, what it should say instead, any dates or slot times."
              className="min-h-[6rem] rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35 disabled:opacity-50"
              aria-invalid={state.status === "error" && state.fieldErrors?.details ? true : undefined}
            />
            {state.status === "error" && state.fieldErrors?.details ? (
              <span className="text-red-300">{state.fieldErrors.details}</span>
            ) : null}
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-white/75">Screenshot or file (optional)</span>
            <input
              name="attachment"
              type="file"
              disabled={pending}
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf,.jpg,.jpeg,.png,.gif,.webp"
              className="text-xs text-white/80 file:mr-2 file:rounded file:border-0 file:bg-white/15 file:px-2 file:py-1 file:text-white disabled:opacity-50"
            />
            <span className="text-white/45">PDF or image, up to 4MB, one file.</span>
            {state.status === "error" && state.fieldErrors?.attachment ? (
              <span className="text-red-300">{state.fieldErrors.attachment}</span>
            ) : null}
          </label>

          <button
            type="submit"
            disabled={pending}
            className="h-10 w-fit rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send to support"}
          </button>
        </form>
      </div>
    </details>
  );
}

export function VenueChangeRequestForm({ defaultEmail, variant = "default" }: Props) {
  const [formKey, setFormKey] = useState(0);
  return (
    <VenueChangeRequestFormInner
      key={formKey}
      defaultEmail={defaultEmail}
      variant={variant}
      onSendAnother={() => setFormKey((k) => k + 1)}
    />
  );
}
