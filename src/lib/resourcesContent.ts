export type ResourceArticle = {
  slug: string;
  title: string;
  description: string;
  category: "venue-ops" | "community" | "performer" | "strategy";
  readingMinutes: number;
  publishedAt: string;
  updatedAt: string;
  intro: string;
  sections: { heading: string; paragraphs: string[] }[];
  keyTakeaways: string[];
  relatedDiscoveryLinks: { href: string; label: string }[];
};

const ARTICLES: ResourceArticle[] = [
  {
    slug: "why-open-mic-nights-work-for-venues",
    title: "Why open mic nights work for venues",
    description:
      "A practical guide for venue owners on how open mic nights create repeat foot traffic, stronger weeknight revenue, and long-term local visibility.",
    category: "venue-ops",
    readingMinutes: 7,
    publishedAt: "2026-03-31",
    updatedAt: "2026-03-31",
    intro:
      "Open mic nights are one of the few recurring programs that can improve both atmosphere and consistency on slower nights. When structured well, they give performers predictable opportunities and give customers a reason to come back.",
    sections: [
      {
        heading: "They create reliable weeknight momentum",
        paragraphs: [
          "Most venues see uneven traffic between high-demand weekend nights and quieter weekdays. A recurring open mic can fill part of that gap by giving local performers and their circles a standing reason to visit.",
          "Consistency is the key benefit. When your schedule appears publicly and updates are predictable, people stop treating the event as one-off and start treating it as part of their routine.",
        ],
      },
      {
        heading: "They increase return visits without heavy promotion",
        paragraphs: [
          "Regular performers often return to improve material, test new sets, and network. That naturally creates repeat customer behavior around one recurring event theme.",
          "Venue pages with stable schedule details also make rediscovery easier. People can check dates, times, and slot availability without messaging back and forth.",
        ],
      },
      {
        heading: "They strengthen your local identity",
        paragraphs: [
          "When local artists repeatedly associate your room with quality and organization, your venue earns a specific reputation in the scene. That reputation helps both performers and audiences choose you over alternatives.",
          "Clear public pages also support local search intent. People looking for nearby open mics are more likely to engage when they can quickly verify location and schedule context.",
        ],
      },
    ],
    keyTakeaways: [
      "A recurring open mic can stabilize slower nights.",
      "Predictable public schedules make return visits more likely.",
      "Scene reputation grows faster when booking details are clear.",
    ],
    relatedDiscoveryLinks: [
      { href: "/venues", label: "Browse public open mic venues" },
      { href: "/locations", label: "Explore open mic activity by location" },
    ],
  },
  {
    slug: "how-open-mics-help-neighborhoods",
    title: "How open mic nights help neighborhoods and local communities",
    description:
      "Understand how recurring open mics support local artists, nearby businesses, and community culture through consistent, accessible live performance spaces.",
    category: "community",
    readingMinutes: 6,
    publishedAt: "2026-03-31",
    updatedAt: "2026-03-31",
    intro:
      "A good open mic is more than a stage list. It can become a weekly cultural anchor that supports artists, attracts neighbors, and gives small businesses a steady audience touchpoint.",
    sections: [
      {
        heading: "They lower the barrier to local participation",
        paragraphs: [
          "Open mics allow new performers to participate without the pressure of a full headline set. That accessibility helps build a broader pipeline of local talent.",
          "Community members who are not ready for major events still show up to support friends, which increases local engagement around the venue.",
        ],
      },
      {
        heading: "They keep local spending local",
        paragraphs: [
          "Recurring neighborhood events can drive repeat visits to nearby food, coffee, and retail spots before or after performances.",
          "When the event schedule is easy to find, people plan around it. That planning behavior benefits multiple businesses in the area, not only the host venue.",
        ],
      },
      {
        heading: "They create shared cultural memory",
        paragraphs: [
          "Local scenes grow when people have regular places to gather and perform. Over time, open mics can become part of a neighborhood's identity.",
          "Venue pages and location discovery hubs make those events more visible to newcomers who want to participate in local culture.",
        ],
      },
    ],
    keyTakeaways: [
      "Open mics improve access for first-time performers.",
      "They can increase repeat neighborhood foot traffic.",
      "Consistent event visibility strengthens local cultural identity.",
    ],
    relatedDiscoveryLinks: [
      { href: "/locations", label: "See open mic locations" },
      { href: "/locations", label: "Find local performer activity pages" },
    ],
  },
  {
    slug: "types-of-open-mic-nights",
    title: "Types of open mic nights: acoustic, comedy, poetry, variety, and band-friendly",
    description:
      "A breakdown of common open mic formats and how venues can choose the right setup for audience expectations, stage logistics, and performer demand.",
    category: "venue-ops",
    readingMinutes: 8,
    publishedAt: "2026-03-31",
    updatedAt: "2026-03-31",
    intro:
      "Not all open mics are structured the same way. The best format depends on your room size, equipment, neighborhood expectations, and how much changeover time your stage can handle.",
    sections: [
      {
        heading: "Acoustic-focused formats",
        paragraphs: [
          "Acoustic nights usually work well in smaller rooms with quick transitions and lower technical overhead. They are often easier to run consistently when staffing is lean.",
          "The key decision is slot length. Shorter slots increase throughput; longer slots improve artistic depth.",
        ],
      },
      {
        heading: "Comedy and spoken-word formats",
        paragraphs: [
          "These formats rely heavily on pacing and audience attention. Tight host control and clear timing standards are essential for a good room experience.",
          "Publicly visible start times and sign-up expectations reduce confusion and improve performer preparedness.",
        ],
      },
      {
        heading: "Variety and band-friendly formats",
        paragraphs: [
          "Variety nights can create broader audience appeal but require clear stage rules and backline expectations. Band-friendly setups need stronger changeover planning.",
          "If your venue supports larger setups, publish equipment and format details so performers can self-select effectively.",
        ],
      },
    ],
    keyTakeaways: [
      "Choose a format that matches your room and staffing capacity.",
      "Clear slot rules matter more than format labels.",
      "Publish equipment and timing expectations for better submissions.",
    ],
    relatedDiscoveryLinks: [
      { href: "/venues", label: "Compare venue open mic formats" },
      { href: "/performers", label: "Browse performer profiles" },
    ],
  },
  {
    slug: "how-to-run-a-successful-open-mic-night",
    title: "How to run a successful open mic night",
    description:
      "A practical operations checklist for hosts and venue teams: scheduling, slot structure, communication, and consistency practices that improve open mic reliability.",
    category: "strategy",
    readingMinutes: 9,
    publishedAt: "2026-03-31",
    updatedAt: "2026-03-31",
    intro:
      "Successful open mics are rarely accidental. They are usually the result of clear schedule rules, reliable communication, and a host workflow that performers can trust.",
    sections: [
      {
        heading: "Set predictable structure first",
        paragraphs: [
          "Define a recurring day/time, slot length, and break pattern before optimizing anything else. Predictability does more for attendance than frequent format changes.",
          "When your schedule appears in a stable public page, repeat performers and first-time visitors can both self-serve basic details.",
        ],
      },
      {
        heading: "Make booking expectations explicit",
        paragraphs: [
          "State when booking opens, what counts as an available slot, and when booking closes for each date. Ambiguity creates no-shows and overbooking stress.",
          "Use visible slot statuses so performers and staff share the same source of truth.",
        ],
      },
      {
        heading: "Close the loop after each event",
        paragraphs: [
          "Track what worked: pacing, no-show rate, average audience dwell time, and performer sentiment. Small adjustments each week outperform large occasional resets.",
          "Consistency over novelty is usually the winning strategy for recurring open mic programs.",
        ],
      },
    ],
    keyTakeaways: [
      "Consistent schedule structure drives reliability.",
      "Explicit booking rules reduce confusion and churn.",
      "Weekly operational feedback improves long-term quality.",
    ],
    relatedDiscoveryLinks: [
      { href: "/venues", label: "Use venue pages as your public schedule hub" },
      { href: "/locations", label: "Connect scheduling to local discovery pages" },
    ],
  },
  {
    slug: "what-performers-look-for-in-open-mics",
    title: "What performers look for in a great open mic",
    description:
      "Understand performer priorities: clear slot rules, fair hosting, technical readiness, and predictable communication that encourages repeat participation.",
    category: "performer",
    readingMinutes: 7,
    publishedAt: "2026-03-31",
    updatedAt: "2026-03-31",
    intro:
      "Performers evaluate open mics quickly. They notice whether expectations are clear, whether timing is respected, and whether the room supports the kind of set they want to bring.",
    sections: [
      {
        heading: "Clarity and fairness",
        paragraphs: [
          "Artists value transparent sign-up and slot assignment rules. Even simple systems work when they are applied consistently.",
          "Public schedule pages with clear availability reduce friction and build trust before the artist even arrives.",
        ],
      },
      {
        heading: "Stage and technical readiness",
        paragraphs: [
          "Format and equipment details matter. Performers decide whether to attend based on setup compatibility and expected changeover constraints.",
          "A venue that publishes practical equipment information saves everyone time and improves show flow.",
        ],
      },
      {
        heading: "Reliable event experience",
        paragraphs: [
          "Artists return when the host keeps timing tight, respects the lineup, and communicates changes promptly.",
          "Repeat participation is usually earned through consistency, not hype.",
        ],
      },
    ],
    keyTakeaways: [
      "Transparent slot rules encourage repeat performers.",
      "Equipment and format details improve fit and quality.",
      "Host consistency is a major retention driver.",
    ],
    relatedDiscoveryLinks: [
      { href: "/locations", label: "Find active open mic locations" },
      { href: "/venues", label: "Review venue pages before booking" },
    ],
  },
  {
    slug: "open-mics-repeat-visits-customer-loyalty",
    title: "Why open mic nights drive repeat visits and customer loyalty",
    description:
      "Learn how recurring open mic programming supports customer retention through familiarity, social participation, and steady local event expectations.",
    category: "strategy",
    readingMinutes: 6,
    publishedAt: "2026-03-31",
    updatedAt: "2026-03-31",
    intro:
      "Loyalty grows when customers know what to expect and when to come back. Open mics can provide that rhythm while still keeping each night fresh through different performers.",
    sections: [
      {
        heading: "Familiar framework, changing lineup",
        paragraphs: [
          "A recurring format gives customers confidence in timing and atmosphere, while the performer mix keeps the experience from feeling repetitive.",
          "This balance of consistency and novelty is ideal for repeat attendance.",
        ],
      },
      {
        heading: "Social return loops",
        paragraphs: [
          "Performers bring friends and collaborators, who in turn become aware of the venue's recurring programming. This social loop often compounds over time.",
          "Public schedule and discovery pages support that loop by making return planning easier.",
        ],
      },
      {
        heading: "Operational consistency supports retention",
        paragraphs: [
          "When nights start on time and booking expectations are clear, customers trust the experience. Trust is a practical form of loyalty.",
          "Retention tends to come from repeatable quality signals, not one-off promotions.",
        ],
      },
    ],
    keyTakeaways: [
      "Open mics combine predictability with fresh performers.",
      "Social audience loops can compound repeat visits.",
      "Operational consistency is a loyalty driver.",
    ],
    relatedDiscoveryLinks: [
      { href: "/venues", label: "See venue pages with recurring schedules" },
      { href: "/locations", label: "Explore local open mic discovery pages" },
    ],
  },
];

export function getAllResourceArticles(): ResourceArticle[] {
  return [...ARTICLES];
}

export function getResourceArticleBySlug(slug: string): ResourceArticle | null {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}
