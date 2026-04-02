type Props = { className?: string };

/** Short beta disclaimer for auth pages and footer. */
export function BetaNote({ className }: Props) {
  return (
    <p className={`text-xs leading-relaxed text-white/45 ${className ?? ""}`.trim()}>
      MicStage is currently in beta. Features may evolve as we improve the platform.
    </p>
  );
}
