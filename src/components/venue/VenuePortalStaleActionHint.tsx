"use client";

/**
 * Subtle guidance for post-deploy server action mismatches (open tab vs new deployment).
 */
export function VenuePortalStaleActionHint() {
  return (
    <aside className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] leading-snug text-white/50">
      <span className="text-white/60">After an update,</span> if a control stops working,{" "}
      <button
        type="button"
        className="font-medium text-[rgb(var(--om-neon))] underline decoration-white/25 underline-offset-2 hover:brightness-110"
        onClick={() => window.location.reload()}
      >
        refresh this page
      </button>{" "}
      once so your browser matches the latest MicStage build.
    </aside>
  );
}
