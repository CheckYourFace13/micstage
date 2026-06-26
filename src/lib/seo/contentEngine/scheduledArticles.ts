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
      "Practical ways to find open mic nights happening tonight near you — search tools, venue pages, sign-up windows, and what to check before you leave home.",
    category: "performer",
    readingMinutes: 9,
    publishedAt: "2026-06-19",
    updatedAt: "2026-06-19",
    intro:
      "If you searched “open mics tonight near me,” you probably need three answers fast: is there a show, what time do signups close, and is the room right for your act. MicStage is an open mic night platform for performers and venues — not stage sound equipment or theater mic placement. This guide walks through how to find real open mic events tonight, how to confirm they are still happening, and how to show up prepared.",
    practicalTips: [
      "Search by city or ZIP on MicStage’s finder, then filter for tonight’s weekday on the venue or map view.",
      "Confirm sign-up cutoff — many open mics stop taking names 30–60 minutes before the first act.",
      "Read the venue’s format (music-only, comedy, mixed) so you do not book a poetry night with a full band.",
      "Save the venue’s public MicStage page — schedules update there instead of scattered social posts.",
      "Bring a short set list and a backup song; hosts appreciate performers who respect the clock.",
    ],
    sections: [
      {
        heading: "Start with a live directory, not a generic web search",
        paragraphs: [
          "Generic searches often mix open mic nights with unrelated results about microphones on stage. Use an open mic–specific directory so results are venues and nights, not sound-tech tutorials.",
          "MicStage lists public venue pages with schedules and booking links where venues enable them. The map and find-open-mics tools sort by distance when you share location or enter a ZIP.",
        ],
      },
      {
        heading: "What to verify before you drive over",
        paragraphs: [
          "Check whether the night is recurring or a one-off cancellation. Holidays and private events sometimes pause an open mic without updating every social channel.",
          "Look for host contact, slot length, and whether the room is 21+. Beginners especially should know cover charges and gear expectations upfront.",
        ],
      },
      {
        heading: "For venues: make tonight discoverable",
        paragraphs: [
          "If you run an open mic venue, publish tonight’s start time and sign-up rules on your MicStage page. Performers searching tonight are high-intent — missing info costs you walk-ins.",
        ],
      },
    ],
    faq: [
      {
        q: "Is MicStage the same as advice about micing a stage for theater?",
        a: "No. MicStage helps people find open mic nights and book performance slots at venues. It is not a guide for sound engineers placing microphones on a theater stage.",
      },
      {
        q: "Can I book an open mic slot for tonight on MicStage?",
        a: "When a venue enables booking on MicStage, you can reserve from their public page. Otherwise, show up during the venue’s posted sign-up window.",
      },
    ],
    relatedGuides: [
      { slug: "how-to-find-open-mic-nights-near-you", label: "Find open mic nights near you (any day)" },
      { slug: "what-to-expect-at-your-first-open-mic", label: "Your first open mic" },
    ],
    keyTakeaways: [
      "Use open mic–specific tools to avoid irrelevant “stage microphone” search results.",
      "Confirm sign-up time, format, and age policy before leaving home.",
      "Venues should publish tonight’s details on a single canonical page.",
    ],
    relatedDiscoveryLinks: [
      { href: "/find-open-mics", label: "Find open mics near you" },
      { href: "/map", label: "Open mic map" },
      { href: "/venues", label: "Venue directory" },
    ],
  },
  {
    slug: "how-to-find-open-mic-nights-near-you",
    title: "How to find open mic nights near you (performers & venues)",
    description:
      "A step-by-step guide to finding open mic nights by city, metro, or ZIP — built for singers, comedians, poets, and venue owners listing their room.",
    category: "performer",
    readingMinutes: 10,
    publishedAt: "2026-06-19",
    updatedAt: "2026-06-19",
    intro:
      "Whether you are a performer looking for stage time or a venue owner comparing how other rooms promote their night, the goal is the same: accurate, local information about open mic events. MicStage connects open mic venues and artists through public schedules and discovery pages — not audio engineering for stage plays.",
    practicalTips: [
      "Use ZIP or city search first, then browse metro hubs for smaller towns rolled into a region.",
      "Follow venue pages that match your format (acoustic, comedy, poetry, mixed).",
      "Compare weeknight vs weekend options — many strong open mics are Tuesday–Thursday.",
      "Venue owners: claim your listing so performers see the same schedule your staff uses.",
    ],
    sections: [
      {
        heading: "Search by location on MicStage",
        paragraphs: [
          "Start at find-open-mics or the open mic map. Enter your city or ZIP to sort venues by distance. Metro and regional pages group activity when a town does not yet have enough listings for its own hub.",
        ],
      },
      {
        heading: "Evaluate a room before your first visit",
        paragraphs: [
          "Read slot length, sign-up style (list vs lottery vs online), and house gear. Performers waste less time when expectations are posted.",
          "Artists can browse the performers directory by stage name when looking for collaborators who play local open mics.",
        ],
      },
      {
        heading: "Venues: get found by the right searches",
        paragraphs: [
          "List your open mic night with a clear title, neighborhood, and weekly time. Phrases like “open mic night” and your city help search engines show your page to performers — not unrelated “mic stage” sound topics.",
        ],
      },
    ],
    faq: [
      {
        q: "What is the difference between /venues and /locations?",
        a: "Venue pages are individual rooms with addresses and schedules. Location pages group performer activity by metro or region.",
      },
    ],
    relatedGuides: [
      { slug: "open-mics-tonight-near-me", label: "Open mics tonight" },
      { slug: "list-your-open-mic-venue-on-micstage", label: "List your venue" },
    ],
    keyTakeaways: [
      "Search by ZIP/city, then drill into venue pages for exact times.",
      "Format and sign-up rules matter as much as distance.",
      "Venues should use clear “open mic night” language on public pages.",
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
      "How bar, café, and club owners list an open mic night on MicStage so local performers can find your room, see your schedule, and book slots when enabled.",
    category: "venue-ops",
    readingMinutes: 8,
    publishedAt: "2026-06-19",
    updatedAt: "2026-06-19",
    intro:
      "MicStage is a free open mic platform for venues and artists. Listing your room helps performers searching for open mic nights in your city — and helps you run a clearer schedule than scattered social posts. This is not about microphone placement for theater productions; it is about marketing your recurring open mic to the local music and comedy scene.",
    practicalTips: [
      "Register as a venue, then add your weekly open mic time and sign-up rules.",
      "Upload a recognizable room name and neighborhood — performers search by city first.",
      "Enable public schedules so discovery pages and search engines can index your listing.",
      "Share your MicStage venue link on Instagram bio and printed flyers at the bar.",
    ],
    sections: [
      {
        heading: "Why list on a dedicated open mic platform",
        paragraphs: [
          "Social posts expire; a canonical venue page stays findable. Performers comparing multiple rooms in one evening need stable URLs with times and format.",
          "MicStage discovery surfaces venues on maps, directories, and regional guides as your market grows.",
        ],
      },
      {
        heading: "What to put on your public page",
        paragraphs: [
          "Include day of week, door time, sign-up cutoff, slot length, PA/backline notes, and age policy. The more complete the page, the fewer repetitive DMs your staff answers.",
        ],
      },
    ],
    faq: [
      {
        q: "Does MicStage charge venues to list an open mic?",
        a: "MicStage is built to be free for artists and venues during beta. List your room and publish your schedule to start appearing in discovery.",
      },
    ],
    relatedGuides: [
      { slug: "why-open-mic-nights-work-for-venues", label: "Why open mics work for venues" },
      { slug: "how-to-run-a-successful-open-mic-night", label: "Run a successful open mic" },
    ],
    keyTakeaways: [
      "A dedicated venue page beats one-off social posts for discovery.",
      "Complete schedules attract better-fit performers.",
      "MicStage is for open mic events — not stage sound engineering.",
    ],
    relatedDiscoveryLinks: [
      { href: "/register/venue", label: "Register your venue" },
      { href: "/venues", label: "See other venue listings" },
      { href: "/resources/why-open-mic-nights-work-for-venues", label: "Why open mics work" },
    ],
  },
];
