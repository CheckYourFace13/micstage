import type { ResourceArticle } from "@/lib/resources/articleTypes";

/**
 * SEO content engine queue — articles merge into `/resources` on `publishedAt` (UTC date).
 * Add rows here; daily cron pings IndexNow for guides published that day.
 */
export const SCHEDULED_RESOURCE_ARTICLES: ResourceArticle[] = [
  {
    slug: "open-mics-tonight-near-me",
    title: "Open mics tonight near me: how to find a show you can actually play",
    description:
      "How to confirm an open mic is happening tonight: weekday match, signup cutoff, format, and what to check before you leave.",
    category: "performer",
    readingMinutes: 6,
    publishedAt: "2026-06-19",
    updatedAt: "2026-08-20",
    intro:
      "If you searched “open mics tonight near me,” you need three answers fast: is there a show tonight, when do signups close, and is the room right for your act. This guide is the day-of checklist — not a general tutorial on finding rooms (use the nearby-nights guide for that).",
    practicalTips: [
      "Filter for today’s weekday, then open the listing and read signup cutoff before you travel.",
      "Many rooms stop taking names 30–60 minutes before the first act.",
      "Match format: comedy, music, poetry, or mixed — don’t assume mixed.",
      "Treat last-confirmed dates as a hint, not a live guarantee. Holidays cancel nights.",
      "Bring a timed set. Hosts keep the night moving.",
    ],
    sections: [
      {
        heading: "Confirm it is actually tonight",
        paragraphs: [
          "A listing with a weekly Tuesday schedule is not automatically running on a holiday Tuesday. Check the listing’s last-confirmed date, the venue website or social if linked, and whether the host posted a cancelation.",
          "On MicStage city hubs, “scheduled for [weekday]” means a recurring night is on file for that day — not a live check-in from the door.",
        ],
      },
      {
        heading: "Signup windows kill more nights than talent",
        paragraphs: [
          "If the listing says list-at-the-door, arrive in the posted window. If it offers online signup, complete it before you leave home so you are not arguing with the list.",
          "Slot length and 21+ rules belong in the same pass. A 4-minute comedy list is not a 12-minute band slot.",
        ],
      },
    ],
    faq: [
      {
        q: "Can I sign up for a spot tonight on MicStage?",
        a: "Only when that listing enables online signups. Otherwise use the posted door list or host process.",
      },
      {
        q: "Why does a listing say the schedule may have changed?",
        a: "Recurring nights get canceled for private events and holidays. Confirm with the venue when the last-confirmed date is old.",
      },
    ],
    relatedGuides: [
      { slug: "how-to-find-open-mic-nights-near-you", label: "Find open mic nights near you (any day)" },
      { slug: "what-to-expect-at-your-first-open-mic", label: "Your first open mic" },
    ],
    keyTakeaways: [
      "Tonight means: weekday match + signup window + format fit.",
      "Recurring schedules are not live confirmation.",
      "Use the general finder guide when you are planning later in the week.",
    ],
    relatedDiscoveryLinks: [
      { href: "/find-open-mics", label: "Find open mics near you" },
      { href: "/map", label: "Open mic map" },
    ],
  },
  {
    slug: "how-to-find-open-mic-nights-near-you",
    title: "How to find open mic nights near you (performers & venues)",
    description:
      "Find open mic nights by city, ZIP, or map — then use the listing for day, time, format, and signup rules.",
    category: "performer",
    readingMinutes: 8,
    publishedAt: "2026-06-19",
    updatedAt: "2026-08-20",
    intro:
      "The useful search is not “is there live music somewhere.” It is: which rooms near me publish a recurring open mic, on which night, with which signup rules. MicStage is built for that — public listings, city hubs, and a map.",
    practicalTips: [
      "Start with ZIP or city search, then open a listing instead of stopping at the result title.",
      "Use metro hubs when a small town rolls up to a larger market.",
      "Weeknights (Tue–Thu) often have more open mics than Friday.",
      "Venue and host operators: claim the listing so the public page matches the door list.",
    ],
    sections: [
      {
        heading: "Search, then read the listing",
        paragraphs: [
          "Use find-open-mics or the map. Distance is only half the decision. The listing should show location, recurring schedule when we have it, type, and signup method.",
          "If a fact is missing, we leave it blank rather than guess. Suggest a correction or ask the host.",
        ],
      },
      {
        heading: "City hubs vs a single listing",
        paragraphs: [
          "City pages group tonight, this week, and categories (music, comedy, spoken word) from real listings — not a generic essay about the town.",
          "Thin markets stay out of search indexes until there is enough inventory to be useful.",
        ],
      },
    ],
    faq: [
      {
        q: "What is the difference between /venues and /locations?",
        a: "Venue pages are individual rooms with addresses and schedules. Location pages group listings (and performer activity) by metro or region.",
      },
      {
        q: "Where do I look for tonight specifically?",
        a: "Use the tonight checklist guide, or a city hub’s “scheduled for [weekday]” section.",
      },
    ],
    relatedGuides: [
      { slug: "open-mics-tonight-near-me", label: "Open mics tonight" },
      { slug: "list-your-open-mic-venue-on-micstage", label: "List your venue" },
    ],
    keyTakeaways: [
      "Search by ZIP/city, then read schedule and signup on the listing.",
      "City hubs summarize real nights — they are not travel articles.",
      "Claimed listings stay more accurate than unclaimed research pages.",
    ],
    relatedDiscoveryLinks: [
      { href: "/find-open-mics", label: "Find open mics" },
      { href: "/locations", label: "Browse by metro" },
      { href: "/register/venue", label: "Venues: create a listing" },
    ],
  },
  {
    slug: "list-your-open-mic-venue-on-micstage",
    title: "List your open mic venue on MicStage (free venue guide)",
    description:
      "How bar, café, and club operators list an open mic on MicStage so performers can see the real schedule and signup rules.",
    category: "venue-ops",
    readingMinutes: 7,
    publishedAt: "2026-06-19",
    updatedAt: "2026-08-20",
    intro:
      "A public MicStage page is the stable URL for your night: day, time, signup rules, and format. Social posts expire; performers comparing two rooms the same evening need one place that matches what the door staff says.",
    practicalTips: [
      "Register as a venue, then publish weekly time and signup rules.",
      "Use the name people actually search — room plus neighborhood.",
      "Share the MicStage link on your Instagram bio and a flyer at the bar.",
      "If you host at rooms you do not own, use a host account instead of a venue account.",
    ],
    sections: [
      {
        heading: "Why a dedicated page beats a feed post",
        paragraphs: [
          "Performers bookmark a URL. They do not scroll six months of Stories to find signups. A canonical page also helps hosts who rotate rooms keep one public identity.",
        ],
      },
      {
        heading: "What to publish",
        paragraphs: [
          "Day of week, start time, signup cutoff, slot length, house gear, and age policy. Incomplete pages create DMs your staff should not have to answer.",
        ],
      },
    ],
    faq: [
      {
        q: "Does MicStage charge venues to list an open mic?",
        a: "No. Listing a room and publishing a schedule is free.",
      },
      {
        q: "I run the night but I don’t own the bar. What do I register as?",
        a: "Register as a host. Venue accounts are for the business that operates the space.",
      },
    ],
    relatedGuides: [
      { slug: "why-open-mic-nights-work-for-venues", label: "Why open mics work for venues" },
      { slug: "how-to-run-a-successful-open-mic-night", label: "Run a successful open mic" },
      { slug: "how-micstage-verifies-open-mic-listings", label: "How listings are verified" },
    ],
    keyTakeaways: [
      "Publish day, time, and signup rules on one page.",
      "Hosts and venue owners use different account types.",
      "Free to list; claim existing research listings when they are yours.",
    ],
    relatedDiscoveryLinks: [
      { href: "/register/venue", label: "Register your venue" },
      { href: "/host", label: "Host an open mic" },
      { href: "/venues", label: "See other venue listings" },
    ],
  },
];
