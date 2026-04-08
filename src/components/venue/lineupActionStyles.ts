/** MicStage public lineup: primary (pink) and secondary (white outline) actions — keep in sync across venue/lineup/share UI. */
export const lineupPrimaryActionClass =
  "inline-flex h-10 w-full items-center justify-center rounded-lg bg-[rgb(var(--om-neon))] px-4 text-sm font-bold text-black shadow-[0_0_0_1px_rgba(255,255,255,0.06)] hover:brightness-110 disabled:opacity-60 sm:h-11 sm:w-auto sm:min-w-[7.5rem]";

export const lineupPrimaryConfirmClass =
  "inline-flex h-10 w-full items-center justify-center rounded-lg bg-emerald-400 px-4 text-sm font-bold text-black hover:brightness-110 disabled:opacity-60 sm:h-11 sm:w-auto sm:min-w-[7.5rem]";

export const lineupSecondaryActionClass =
  "inline-flex h-10 w-full items-center justify-center rounded-lg border-2 border-white/80 bg-white/[0.06] px-4 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:border-white hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--om-neon))] focus-visible:ring-offset-2 focus-visible:ring-offset-black active:bg-white/20 disabled:opacity-60 sm:h-11 sm:w-auto sm:min-w-[7rem]";

export const lineupGhostLinkClass =
  "inline-flex h-10 items-center justify-center rounded-lg border-2 border-white/70 bg-white/[0.05] px-4 text-sm font-semibold text-white hover:border-white/90 hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--om-neon))] focus-visible:ring-offset-2 focus-visible:ring-offset-black active:bg-white/18 sm:h-11";

export const lineupDateChipActive =
  "rounded-full border-2 border-[rgb(var(--om-neon))] bg-[rgb(var(--om-neon))]/15 px-4 py-2 text-sm font-semibold text-white";
export const lineupDateChipIdle =
  "rounded-full border-2 border-white/40 bg-transparent px-4 py-2 text-sm font-semibold text-white/85 hover:border-white/55 hover:bg-white/10";
