/** Short reference for the four lineup slot booking types (venue editor + defaults). */
export function LineupSlotTypesHelp({ className = "" }: { className?: string }) {
  return (
    <aside
      className={`rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-relaxed text-white/60 ${className}`}
    >
      <p className="font-semibold text-white/80">Lineup slot types</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-4 marker:text-white/35">
        <li>
          <span className="text-white/75">Open</span> — anyone can reserve this slot in advance.
        </li>
        <li>
          <span className="text-white/75">Attendees</span> — only available to people physically at the venue on the day,
          within 1 hour before the slot starts (on-premise check).
        </li>
        <li>
          <span className="text-white/75">Daily</span> — the slot cannot be reserved until the day of the event.
        </li>
        <li>
          <span className="text-white/75">House</span> — controlled by the venue only; the public cannot book it online.
        </li>
      </ul>
    </aside>
  );
}
