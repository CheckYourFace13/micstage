"use client";

import { useState } from "react";
import { FormSubmitButton } from "@/components/FormSubmitButton";

type Props = {
  nightId: string;
  /** When true, use Cancel semantics (booked performers). */
  hasActiveBookings: boolean;
  action: (formData: FormData) => void | Promise<void>;
  /** Compact control for dashboard lists. */
  compact?: boolean;
};

export function HostDeleteNightPanel({ nightId, hasActiveBookings, action, compact }: Props) {
  const [open, setOpen] = useState(false);
  const label = hasActiveBookings ? "Cancel night" : "Delete night";
  const pending = hasActiveBookings ? "Canceling…" : "Deleting…";

  return (
    <div className={compact ? "w-full" : "mt-8"}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            compact
              ? "text-xs font-semibold text-red-300/90 underline hover:text-red-200"
              : "rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/20"
          }
        >
          {label}
        </button>
      ) : (
        <form
          action={action}
          className={
            compact
              ? "rounded-md border border-red-400/30 bg-red-950/25 p-2.5"
              : "rounded-xl border border-red-400/35 bg-red-950/25 p-4"
          }
        >
          <input type="hidden" name="nightId" value={nightId} />
          {hasActiveBookings ? (
            <p className={`leading-relaxed text-white/75 ${compact ? "text-[11px]" : "text-sm"}`}>
              Performers are booked for this night. Canceling it will remove the night from public
              signup and notify booked performers. Your other scheduled nights and open mic series
              will not be changed.
            </p>
          ) : (
            <p className={`leading-relaxed text-white/75 ${compact ? "text-[11px]" : "text-sm"}`}>
              Delete this night? This removes this date only. Your other scheduled nights and open
              mic series will not be changed.
            </p>
          )}
          <div className={`flex flex-wrap items-center gap-2 ${compact ? "mt-2" : "mt-3"}`}>
            <FormSubmitButton
              label={hasActiveBookings ? "Cancel night & notify" : "Delete night"}
              pendingLabel={pending}
              className={
                compact
                  ? "h-8 rounded-md border border-red-400/45 bg-red-500/15 px-2.5 text-[11px] font-semibold text-red-100 hover:bg-red-500/25 disabled:opacity-50"
                  : "h-10 rounded-md border border-red-400/50 bg-red-500/20 px-4 text-sm font-semibold text-red-50 hover:bg-red-500/30 disabled:opacity-50"
              }
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={
                compact
                  ? "h-8 rounded-md border border-white/12 bg-white/5 px-2.5 text-[11px] font-medium text-white/75 hover:bg-white/10"
                  : "h-10 rounded-md border border-white/15 bg-white/5 px-4 text-sm font-medium text-white/80 hover:bg-white/10"
              }
            >
              Keep night
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
