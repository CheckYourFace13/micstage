type Props = { className?: string };

/** Optional product note for auth pages / footer. Kept for reuse; not shown site-wide. */
export function BetaNote({ className }: Props) {
  return (
    <p className={`text-xs leading-relaxed text-white/45 ${className ?? ""}`.trim()}>
      MicStage is free for performers, promoters, and venues.
    </p>
  );
}
