/** Default owner inbox for daily/weekly summaries; override with MICSTAGE_OWNER_SUMMARY_EMAIL. */
export function ownerSummaryRecipient(): string {
  return (
    process.env.MICSTAGE_OWNER_SUMMARY_EMAIL?.trim() ||
    process.env.MICSTAGE_OWNER_SUMMARY_TO?.trim() ||
    "chris@iscreamstudio.com"
  );
}
