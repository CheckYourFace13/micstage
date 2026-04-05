import { clearVenueLineupTestDataFormAction } from "@/app/venue/actions";

const CONFIRM_DAY = "CLEAR LINEUP TEST DATA";
const CONFIRM_VENUE = "CLEAR ALL LINEUP DATA FOR THIS VENUE";

type Props = {
  venueId: string;
  /** Current lineup night from dashboard (YYYY-MM-DD); may be null if none selected. */
  selectedYmd: string | null;
  selectedNightLabel: string | null;
};

/**
 * Danger zone: removes bookings and manual slot labels for the chosen scope and reconciles
 * venue performer history counts. Does not delete artist/venue accounts, templates, instances, or slots.
 */
export function VenueTestLineupCleanupPanel({ venueId, selectedYmd, selectedNightLabel }: Props) {
  return (
    <details className="mt-8 rounded-xl border border-amber-600/35 bg-amber-950/15 p-4 open:border-amber-500/50">
      <summary className="cursor-pointer list-none text-sm font-semibold text-amber-100 marker:content-none [&::-webkit-details-marker]:hidden">
        Testing cleanup — clear lineup bookings &amp; performer history (danger)
      </summary>
      <div className="mt-3 space-y-3 text-xs leading-relaxed text-white/70">
        <p>
          Use this to remove <strong className="text-white/90">test bookings</strong>,{" "}
          <strong className="text-white/90">typed manual slot names</strong>, and matching{" "}
          <strong className="text-white/90">previous-performer history</strong> rows for the scope you pick. MicStage{" "}
          <strong className="text-white/90">never</strong> deletes musician or venue logins, recurring templates, generated
          nights, or slot rows. RESERVED slots with bookings become AVAILABLE again.
        </p>
        <ul className="list-inside list-disc text-white/60">
          <li>
            <strong className="text-white/80">Selected night</strong> — only the calendar date you have selected in the chips
            above ({selectedNightLabel ? <span className="text-white/90">{selectedNightLabel}</span> : "pick a night first"}).
          </li>
          <li>
            <strong className="text-white/80">Entire venue</strong> — every generated instance and slot for this venue (all
            dates). Type the longer confirmation phrase.
          </li>
        </ul>
        <p className="text-amber-200/80">
          Performer history is adjusted by reversing the same “touch” counts collected from the cleared slots (unique
          musician / manual keys). If a name was also used on other nights, its history row may only decrement rather than
          disappear.
        </p>
      </div>

      <form action={clearVenueLineupTestDataFormAction} className="mt-4 space-y-3 border-t border-white/10 pt-4">
        <input type="hidden" name="venueId" value={venueId} />
        <input type="hidden" name="dateYmd" value={selectedYmd ?? ""} />

        <fieldset className="space-y-2">
          <legend className="text-[11px] font-medium uppercase tracking-wide text-white/45">Scope</legend>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-white/85">
            <input
              type="radio"
              name="cleanupScope"
              value="selected_day"
              defaultChecked
              disabled={!selectedYmd}
              className="mt-0.5 accent-amber-500 disabled:opacity-40"
            />
            <span>
              Selected night only
              {!selectedYmd ? (
                <span className="block text-xs font-normal text-white/45">Select a date chip above first.</span>
              ) : null}
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-white/85">
            <input type="radio" name="cleanupScope" value="entire_venue" className="mt-0.5 accent-amber-500" />
            <span>Entire venue (all generated open mic nights)</span>
          </label>
        </fieldset>

        <label className="grid gap-1">
          <span className="text-[11px] font-medium text-white/50">
            Type confirmation exactly (night: <code className="text-white/70">{CONFIRM_DAY}</code> · entire venue:{" "}
            <code className="text-white/70">{CONFIRM_VENUE}</code>)
          </span>
          <input
            name="confirmPhrase"
            autoComplete="off"
            placeholder="Confirmation phrase"
            className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35"
          />
        </label>

        <button
          type="submit"
          className="rounded-lg border border-red-500/50 bg-red-950/40 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-950/60"
        >
          Run cleanup
        </button>
      </form>
    </details>
  );
}
