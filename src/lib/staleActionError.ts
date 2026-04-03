/** Heuristic for Next.js post-deploy server action ID mismatches (client bundle vs server). */
export function isLikelyStaleServerActionError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("server action") ||
    m.includes("failed to find server action") ||
    m.includes("older or newer deployment")
  );
}
