/**
 * Competitor comparison facts for /compare.
 * Prices/features verified from official public pages — update VERIFIED_AT when re-checking.
 */
export const COMPETITOR_COMPARE_VERIFIED_AT = "2026-08-15";

export type CompareMark = "YES" | "NO" | "PARTIAL" | "COMING_LATER" | "UNKNOWN";

export type CompetitorId = "micstage" | "ajar_mic" | "open_mic_search" | "cocoscout" | "openmic_us";

export type CompetitorRow = {
  id: CompetitorId;
  name: string;
  url: string;
  sources: Array<{ label: string; url: string }>;
  performerCost: string;
  hostCost: string;
  notes: string;
  features: Record<string, CompareMark>;
};

/** Feature keys shared across the comparison table. */
export const COMPARE_FEATURE_KEYS: Array<{ key: string; label: string }> = [
  { key: "discovery", label: "Open-mic discovery" },
  { key: "venueListing", label: "Venue / mic listing" },
  { key: "promoterTools", label: "Promoter / host tools" },
  { key: "onlineSignup", label: "Online performer signup" },
  { key: "advanceSlots", label: "Advance slot / time selection" },
  { key: "publicLineup", label: "Public lineup" },
  { key: "recurring", label: "Recurring schedules" },
  { key: "sharing", label: "Share links / QR" },
  { key: "venueControl", label: "Venue signup controls" },
  { key: "checkIn", label: "Performer check-in" },
  { key: "timer", label: "Performer timer" },
  { key: "broadcast", label: "Broadcast messaging" },
  { key: "tvDisplay", label: "TV / venue display mode" },
  { key: "calendar", label: "Calendar integration" },
  { key: "history", label: "Performer history" },
  { key: "ratings", label: "Ratings / reputation" },
];

/**
 * MicStage marks reflect LIVE production only (2026-08-15 audit).
 * PARTIAL = exists in a limited form; COMING_LATER = roadmap, not advertised as live.
 */
export const COMPETITORS: CompetitorRow[] = [
  {
    id: "micstage",
    name: "MicStage",
    url: "https://micstage.com",
    sources: [{ label: "MicStage production audit", url: "https://micstage.com" }],
    performerCost: "$0",
    hostCost: "$0 for venues & promoters (current product)",
    notes:
      "Open-mic discovery + schedule + optional online signups + public lineup + share. No credit card. No Stripe billing in production.",
    features: {
      discovery: "YES",
      venueListing: "YES",
      promoterTools: "YES",
      onlineSignup: "YES",
      advanceSlots: "YES",
      publicLineup: "YES",
      recurring: "YES",
      sharing: "YES",
      venueControl: "YES",
      checkIn: "COMING_LATER",
      timer: "COMING_LATER",
      broadcast: "PARTIAL",
      tvDisplay: "COMING_LATER",
      calendar: "COMING_LATER",
      history: "PARTIAL",
      ratings: "NO",
    },
  },
  {
    id: "ajar_mic",
    name: "Ajar Mic",
    url: "https://ajarmic.com/",
    sources: [
      { label: "ajarmic.com (plans)", url: "https://ajarmic.com/" },
      { label: "App Store listing", url: "https://apps.apple.com/us/app/ajar-mic/id6762021039" },
    ],
    performerCost: "Free Artist $0; Premium Artist $5/mo (App Store also lists yearly)",
    hostCost: "Host $20/mo (App Store also lists yearly); free tier includes limited hosting",
    notes:
      "Mobile app focused on live slot signup, venue display/TV, check-in, recurring hosting, broadcast messaging. Verified from official site + App Store IAP (2026-08-15).",
    features: {
      discovery: "YES",
      venueListing: "YES",
      promoterTools: "YES",
      onlineSignup: "YES",
      advanceSlots: "YES",
      publicLineup: "YES",
      recurring: "YES",
      sharing: "YES",
      venueControl: "YES",
      checkIn: "YES",
      timer: "UNKNOWN",
      broadcast: "YES",
      tvDisplay: "YES",
      calendar: "UNKNOWN",
      history: "UNKNOWN",
      ratings: "NO",
    },
  },
  {
    id: "open_mic_search",
    name: "Open Mic Search",
    url: "https://www.openmicsearch.com/",
    sources: [{ label: "openmicsearch.com", url: "https://www.openmicsearch.com/" }],
    performerCost: "Free account; Performer Pro mentioned (price not clearly listed on homepage)",
    hostCost: "Host tools advertised as free to list / free forever",
    notes:
      "Directory + free host tools (sign-up list, timer, bucket draw, applause meter) per homepage (2026-08-15). Comedy-forward positioning; features marked from their marketing claims.",
    features: {
      discovery: "YES",
      venueListing: "YES",
      promoterTools: "YES",
      onlineSignup: "PARTIAL",
      advanceSlots: "UNKNOWN",
      publicLineup: "PARTIAL",
      recurring: "UNKNOWN",
      sharing: "UNKNOWN",
      venueControl: "PARTIAL",
      checkIn: "YES",
      timer: "YES",
      broadcast: "UNKNOWN",
      tvDisplay: "NO",
      calendar: "UNKNOWN",
      history: "YES",
      ratings: "PARTIAL",
    },
  },
  {
    id: "cocoscout",
    name: "CocoScout",
    url: "https://cocoscout.com/",
    sources: [
      { label: "cocoscout.com", url: "https://cocoscout.com/" },
      { label: "For producers", url: "https://www.cocoscout.com/for-producers" },
    ],
    performerCost: "Free forever for performers and staff (per site)",
    hostCost: "Producer $0 (limits); Pro $20/mo or $200/yr + usage fees for payouts/staff",
    notes:
      "Broader live-entertainment production platform (casting, payroll, contracts). Not open-mic-only. Verified 2026-08-15 from official pricing.",
    features: {
      discovery: "PARTIAL",
      venueListing: "PARTIAL",
      promoterTools: "YES",
      onlineSignup: "YES",
      advanceSlots: "PARTIAL",
      publicLineup: "UNKNOWN",
      recurring: "YES",
      sharing: "PARTIAL",
      venueControl: "PARTIAL",
      checkIn: "PARTIAL",
      timer: "NO",
      broadcast: "YES",
      tvDisplay: "NO",
      calendar: "YES",
      history: "YES",
      ratings: "NO",
    },
  },
  {
    id: "openmic_us",
    name: "OpenMic.US",
    url: "https://www.openmic.us/",
    sources: [
      { label: "Host register", url: "https://www.openmic.us/HostRegister/" },
      { label: "Venue sales", url: "https://www.openmic.us/p/venue-sales-page.html" },
    ],
    performerCost: "Directory browsing free",
    hostCost: "Free listing (one event); Open Mic Pro $20/week for promotion",
    notes: "Long-running directory + email promotion package. Verified 2026-08-15 from HostRegister.",
    features: {
      discovery: "YES",
      venueListing: "YES",
      promoterTools: "PARTIAL",
      onlineSignup: "NO",
      advanceSlots: "NO",
      publicLineup: "NO",
      recurring: "PARTIAL",
      sharing: "PARTIAL",
      venueControl: "NO",
      checkIn: "NO",
      timer: "NO",
      broadcast: "PARTIAL",
      tvDisplay: "NO",
      calendar: "NO",
      history: "NO",
      ratings: "NO",
    },
  },
];
