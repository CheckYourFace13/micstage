/**
 * Opt-in DB connection diagnostics. Set `MICSTAGE_DEBUG_DB=1` to enable (avoids noisy production logs).
 */
export function logDbDebug(message: string, ...args: unknown[]): void {
  if (process.env.MICSTAGE_DEBUG_DB === "1") {
    console.log(message, ...args);
  }
}
