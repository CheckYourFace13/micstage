"use client";

import { FormSubmitButton } from "@/components/FormSubmitButton";

export function HostNightDisputeForm(props: { nightId: string; venueName: string }) {
  return (
    <section className="mt-10 rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm text-white/70">
        This event isn&apos;t hosted at <span className="text-white">{props.venueName}</span>?
      </p>
      <form action={`/nights/${props.nightId}/dispute-submit`} method="post" className="mt-3 grid gap-2">
        <label className="grid gap-1 text-sm">
          <span className="text-white/60">Brief reason (optional)</span>
          <textarea
            name="reason"
            rows={2}
            maxLength={500}
            placeholder="Wrong venue, wrong date, or unauthorized association…"
            className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40"
          />
        </label>
        <FormSubmitButton label="Report incorrect event" className="h-10 w-fit rounded-md border border-white/20 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10" />
      </form>
      <p className="mt-2 text-xs text-white/45">Reports are reviewed — events are not removed automatically.</p>
    </section>
  );
}
