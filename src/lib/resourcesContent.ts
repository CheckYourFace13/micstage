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
  /** Short, actionable bullets after the intro. */
  practicalTips?: string[];
  /** People-first Q&A for long-tail queries. */
  faq?: { q: string; a: string }[];
  /** Cross-links to other `/resources/[slug]` guides. */
  relatedGuides?: { slug: string; label: string }[];
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
    readingMinutes: 8,
    publishedAt: "2026-03-31",
    updatedAt: "2026-04-13",
    intro:
      "Open mic nights are one of the few recurring programs that can improve both atmosphere and consistency on slower nights. When structured well, they give performers predictable opportunities and give customers a reason to come back—without turning your room into a nightly production burden.",
    practicalTips: [
      "Pick one fixed night and protect it on your calendar for at least 8–12 weeks before judging results.",
      "Publish start time, sign-up window, and slot length in the same place every week (your MicStage venue page is ideal).",
      "Track weeknight bar tabs separately from weekends so you can see whether the open mic is moving revenue, not just bodies.",
      "Pair the night with a simple food or drink special so first-timers have an easy default order.",
    ],
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
    faq: [
      {
        q: "Do open mics only work in big cities?",
        a: "No. Smaller scenes often respond even more strongly to consistency because there are fewer competing weeknight events. The winning pattern is the same: predictable schedule, fair hosting, and clear public details.",
      },
      {
        q: "What is the biggest mistake venues make with open mics?",
        a: "Changing the format or time too often. Performers and audiences both need repetition to build habits. Adjust slowly, and communicate changes clearly on your public page.",
      },
      {
        q: "How do I know if the night is working?",
        a: "Look for repeat performers, improving start-time adherence, and weeknight sales that hold steady or climb over a multi-week window—not a single packed night followed by silence.",
      },
    ],
    relatedGuides: [
      { slug: "open-mics-repeat-visits-customer-loyalty", label: "Repeat visits and customer loyalty" },
      { slug: "how-to-run-a-successful-open-mic-night", label: "How to run a successful open mic" },
      { slug: "how-micstage-helps-venues-and-performers-connect", label: "How MicStage helps venues and performers connect" },
    ],
    keyTakeaways: [
      "A recurring open mic can stabilize slower nights.",
      "Predictable public schedules make return visits more likely.",
      "Scene reputation grows faster when booking details are clear.",
    ],
    relatedDiscoveryLinks: [
      { href: "/venues", label: "Browse public open mic venues" },
      { href: "/map", label: "Open mic map" },
      { href: "/find-open-mics", label: "Find open mics near you" },
    ],
  },
  {
    slug: "how-open-mics-help-neighborhoods",
    title: "How open mic nights help neighborhoods and local scenes",
    description:
      "How recurring open mics support local artists, nearby businesses, and community culture—building stronger block-by-block creative scenes.",
    category: "community",
    readingMinutes: 7,
    publishedAt: "2026-03-31",
    updatedAt: "2026-04-13",
    intro:
      "A good open mic is more than a stage list. It can become a weekly cultural anchor that supports artists, attracts neighbors, and gives small businesses a steady audience touchpoint. Healthy local scenes usually grow from repetition, not one-off viral moments.",
    practicalTips: [
      "Coordinate with one nearby business (coffee, dessert, late-night food) so newcomers know where to land before or after the show.",
      "Invite a local library, school arts program, or community board to list the event—keep the ask lightweight and factual.",
      "Use neighborhood-specific language in your public description so searchers recognize the area you serve.",
      "Rotate a short “local feature” slot so regulars meet new faces without lengthening the whole night.",
    ],
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
    faq: [
      {
        q: "Are open mics only for musicians?",
        a: "No. Many rooms host comedy, poetry, or variety formats. The community benefit is similar: a predictable place to gather, share work, and meet collaborators.",
      },
      {
        q: "How can neighbors discover a mic that already exists?",
        a: "Public schedules and maps reduce friction. When venues publish accurate details, discovery pages and map tools can point people to the right night without endless DMs.",
      },
      {
        q: "What is a sign a scene is getting healthier?",
        a: "New performers show up, experienced performers return, and audiences stay respectful through the whole lineup—not only during headline-quality sets.",
      },
    ],
    relatedGuides: [
      { slug: "why-open-mic-nights-work-for-venues", label: "Why open mics work for venues" },
      { slug: "what-to-expect-at-your-first-open-mic", label: "What to expect at your first open mic" },
      { slug: "types-of-open-mic-nights", label: "Types of open mic nights explained" },
    ],
    keyTakeaways: [
      "Open mics improve access for first-time performers.",
      "They can increase repeat neighborhood foot traffic.",
      "Consistent event visibility strengthens local cultural identity.",
    ],
    relatedDiscoveryLinks: [
      { href: "/locations", label: "Explore open mic activity by location" },
      { href: "/map", label: "Browse venues on the map" },
      { href: "/find-open-mics", label: "Find open mics" },
    ],
  },
  {
    slug: "types-of-open-mic-nights",
    title: "Types of open mic nights explained",
    description:
      "Acoustic, comedy, poetry, variety, and band-friendly formats—how each works, what audiences expect, and how to choose the right setup for your room.",
    category: "venue-ops",
    readingMinutes: 9,
    publishedAt: "2026-03-31",
    updatedAt: "2026-04-13",
    intro:
      "Not all open mics are structured the same way. The best format depends on your room size, equipment, neighborhood expectations, and how much changeover time your stage can handle. This guide explains common formats so you can match the night to your venue—not the other way around.",
    practicalTips: [
      "Put your format rules on your public page: content boundaries, slot length, and whether backing tracks or drums are allowed.",
      "If you host comedy, plan for tighter host transitions; if you host acoustic music, plan for tuning and capo changes.",
      "For variety nights, cap the number of “high setup” acts per week so changeovers do not balloon.",
      "If you are unsure, start with a simpler format and add complexity after attendance stabilizes.",
    ],
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
    faq: [
      {
        q: "Can a venue switch formats week to week?",
        a: "You can, but frequent changes confuse performers and audiences. If you must switch, treat it like a new launch: update your public page immediately and repeat the new rules for several weeks.",
      },
      {
        q: "What format is easiest for first-time hosts?",
        a: "Acoustic or singer-songwriter setups often have the simplest technical path. Comedy and band nights reward experience because timing and stage logistics matter more.",
      },
      {
        q: "How do performers choose which open mic to attend?",
        a: "They look for format fit, slot fairness, and clarity. Guides like “what performers look for” and your venue’s public details both help them decide quickly.",
      },
    ],
    relatedGuides: [
      { slug: "what-performers-look-for-in-open-mics", label: "What performers look for" },
      { slug: "how-to-run-a-successful-open-mic-night", label: "How to run a successful open mic" },
      { slug: "what-to-expect-at-your-first-open-mic", label: "First open mic expectations" },
    ],
    keyTakeaways: [
      "Choose a format that matches your room and staffing capacity.",
      "Clear slot rules matter more than format labels.",
      "Publish equipment and timing expectations for better submissions.",
    ],
    relatedDiscoveryLinks: [
      { href: "/venues", label: "Compare venue open mic formats" },
      { href: "/performers", label: "Browse performer profiles" },
      { href: "/map", label: "Map of open mic venues" },
    ],
  },
  {
    slug: "how-to-run-a-successful-open-mic-night",
    title: "How to run a successful open mic night",
    description:
      "Scheduling, slot structure, communication, and consistency practices that make open mics reliable for venues, hosts, and performers.",
    category: "strategy",
    readingMinutes: 10,
    publishedAt: "2026-03-31",
    updatedAt: "2026-04-13",
    intro:
      "Successful open mics are rarely accidental. They are usually the result of clear schedule rules, reliable communication, and a host workflow that performers can trust. This guide focuses on operations that scale from small rooms to busier weeknight programs.",
    practicalTips: [
      "Arrive early enough to soundcheck one reference channel and confirm the host mic—small checks prevent big delays.",
      "Post a printed or projected running order once slots are locked; verbal-only lineups frustrate audiences and performers.",
      "End on time at least 80% of nights; occasional overruns happen, but chronic late finishes train people to skip the last acts.",
      "Keep a simple no-show policy and apply it consistently so the lineup stays fair.",
    ],
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
    faq: [
      {
        q: "Should the host also perform every week?",
        a: "Occasionally is fine, but the host’s primary job is timekeeping and crowd energy. If the host performs often, add a co-host or stage manager for coverage.",
      },
      {
        q: "How many slots should an open mic have?",
        a: "It depends on slot length and hard stop time. A simple rule: divide your available stage time by average slot length, then leave buffer for announcements and changeovers.",
      },
      {
        q: "What is the best way to reduce chaos at sign-up?",
        a: "Publish a single sign-up method and deadline. Whether it is digital booking or in-person list, consistency matters more than the tool itself.",
      },
    ],
    relatedGuides: [
      { slug: "types-of-open-mic-nights", label: "Types of open mic nights" },
      { slug: "what-performers-look-for-in-open-mics", label: "What performers look for" },
      { slug: "why-open-mic-nights-work-for-venues", label: "Why open mics work for venues" },
    ],
    keyTakeaways: [
      "Consistent schedule structure drives reliability.",
      "Explicit booking rules reduce confusion and churn.",
      "Weekly operational feedback improves long-term quality.",
    ],
    relatedDiscoveryLinks: [
      { href: "/venues", label: "Use venue pages as your public schedule hub" },
      { href: "/find-open-mics", label: "Find open mics (discovery)" },
      { href: "/locations", label: "Explore locations" },
    ],
  },
  {
    slug: "what-performers-look-for-in-open-mics",
    title: "What performers look for in open mics",
    description:
      "Clear slot rules, fair hosting, technical readiness, and predictable communication—the practical signals performers use to choose where to spend their time.",
    category: "performer",
    readingMinutes: 8,
    publishedAt: "2026-03-31",
    updatedAt: "2026-04-13",
    intro:
      "Performers evaluate open mics quickly. They notice whether expectations are clear, whether timing is respected, and whether the room supports the kind of set they want to bring. Venues that understand these signals attract better shows with less friction.",
    practicalTips: [
      "If you are performing, screenshot or bookmark the venue’s public schedule page so you have a time reference that matches what staff use.",
      "Arrive with a backup plan for cables and batteries—even friendly rooms forget consumables sometimes.",
      "Ask one clear question if anything is ambiguous: slot length, content boundaries, and where to line up.",
      "Thank the host publicly when timing is tight; it reinforces good behavior for the whole room.",
    ],
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
    faq: [
      {
        q: "Is it rude to leave right after my set?",
        a: "Not if you communicate support in another way—but staying for a few acts builds relationships and improves your odds of being welcomed back.",
      },
      {
        q: "What should I do if the room runs late?",
        a: "Ask the host for a realistic ETA. If you must leave, be upfront early so the host can adjust order without surprises.",
      },
      {
        q: "How do I find open mics that fit my act?",
        a: "Start with discovery tools and venue pages that describe format and equipment. MicStage’s find and map experiences are built to reduce guesswork.",
      },
    ],
    relatedGuides: [
      { slug: "what-to-expect-at-your-first-open-mic", label: "Your first open mic" },
      { slug: "types-of-open-mic-nights", label: "Types of open mic nights" },
      { slug: "how-micstage-helps-venues-and-performers-connect", label: "How MicStage helps you connect" },
    ],
    keyTakeaways: [
      "Transparent slot rules encourage repeat performers.",
      "Equipment and format details improve fit and quality.",
      "Host consistency is a major retention driver.",
    ],
    relatedDiscoveryLinks: [
      { href: "/find-open-mics", label: "Find open mics" },
      { href: "/map", label: "Venue map" },
      { href: "/venues", label: "Venue pages" },
    ],
  },
  {
    slug: "open-mics-repeat-visits-customer-loyalty",
    title: "How open mic nights drive repeat visits and customer loyalty",
    description:
      "Why recurring open mic programming supports customer retention through familiarity, social participation, and steady local expectations.",
    category: "strategy",
    readingMinutes: 7,
    publishedAt: "2026-03-31",
    updatedAt: "2026-04-13",
    intro:
      "Loyalty grows when customers know what to expect and when to come back. Open mics can provide that rhythm while still keeping each night fresh through different performers. The result is a weeknight habit that feels human—not like a discount treadmill.",
    practicalTips: [
      "Train staff to mention the open mic during weekday visits: a single sentence at checkout can lift awareness.",
      "Keep a “regulars welcome” ritual (shout-outs, returning performer intros) without making newcomers feel excluded.",
      "Track repeat visits with a simple weekly cohort: same card payments, same performers, or reservation notes.",
      "Celebrate small milestones (100th mic, anniversary night) without changing the core schedule.",
    ],
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
    faq: [
      {
        q: "Do loyalty programs replace the need for a strong open mic?",
        a: "They solve different problems. Points programs can nudge behavior, but open mics build emotional attachment to a specific night and room.",
      },
      {
        q: "What if attendance is uneven week to week?",
        a: "That is normal early on. Focus on tightening operations and communication for 6–8 weeks before changing format. Many rooms quit too early.",
      },
      {
        q: "How does discovery help loyalty?",
        a: "When people can re-find your schedule quickly, they are more likely to return. Friction in discovery quietly kills repeat visits.",
      },
    ],
    relatedGuides: [
      { slug: "why-open-mic-nights-work-for-venues", label: "Why open mics work for venues" },
      { slug: "how-to-run-a-successful-open-mic-night", label: "Run a successful open mic" },
      { slug: "how-micstage-helps-venues-and-performers-connect", label: "How MicStage helps" },
    ],
    keyTakeaways: [
      "Open mics combine predictability with fresh performers.",
      "Social audience loops can compound repeat visits.",
      "Operational consistency is a loyalty driver.",
    ],
    relatedDiscoveryLinks: [
      { href: "/venues", label: "Venue pages with recurring schedules" },
      { href: "/map", label: "Open mic map" },
      { href: "/locations", label: "Local discovery pages" },
    ],
  },
  {
    slug: "what-to-expect-at-your-first-open-mic",
    title: "What to expect at your first open mic (and how to prepare)",
    description:
      "A calm, practical walkthrough for first-timers: arrival timing, sign-up flow, audience etiquette, and how to set a goal that makes the night worth it.",
    category: "performer",
    readingMinutes: 7,
    publishedAt: "2026-04-13",
    updatedAt: "2026-04-13",
    intro:
      "Your first open mic does not need to be perfect—it needs to be clear. Most anxiety comes from unknowns: when to arrive, how slots work, and what “good” looks like in a supportive room. This guide removes the guesswork so you can focus on performing and learning.",
    practicalTips: [
      "Plan to arrive at least 20–30 minutes before the listed start if sign-up is in person.",
      "Bring a printed set list or phone note with your first line memorized—tech hiccups happen.",
      "Set one learning goal (timing, crowd connection, new joke landing) instead of judging the whole night on applause.",
      "Introduce yourself to the host with your name and slot preference; kindness and clarity go a long way.",
    ],
    sections: [
      {
        heading: "Before you arrive: what to verify online",
        paragraphs: [
          "Check the venue’s public page for start time, format, slot length, and any sign-up rules. If booking is digital, confirm your slot status early so you are not troubleshooting at doors-open.",
          "If you are unsure about content boundaries (clean vs adult rooms, political material, etc.), assume a respectful default until you learn the room.",
        ],
      },
      {
        heading: "At the venue: typical flow",
        paragraphs: [
          "Many open mics follow a pattern: doors, sign-up window, host welcome, performances in order, and a hard stop or encore depending on the room.",
          "Hosts may adjust order for technical needs or time. Flexibility helps the whole lineup finish strong.",
        ],
      },
      {
        heading: "Audience etiquette (for performers and friends)",
        paragraphs: [
          "Support other acts with attention—not just politeness. Rooms improve when audiences treat every slot as part of the same shared night.",
          "If you bring friends, remind them that talking during sets hurts performers and the venue’s reputation.",
        ],
      },
    ],
    faq: [
      {
        q: "How long is a typical beginner slot?",
        a: "Many rooms use 3–7 minutes for newer performers, but it varies. Always confirm with the posted rules or the host.",
      },
      {
        q: "What if I get nervous and rush?",
        a: "It is extremely common. Practice your first 15 seconds more than the rest of the set—that is where nerves spike.",
      },
      {
        q: "Should I record my set?",
        a: "Ask the venue first. Some rooms discourage video for performer comfort; audio notes for personal review are often easier to approve.",
      },
    ],
    relatedGuides: [
      { slug: "what-performers-look-for-in-open-mics", label: "What performers look for" },
      { slug: "types-of-open-mic-nights", label: "Types of open mic nights" },
      { slug: "how-open-mics-help-neighborhoods", label: "How open mics help neighborhoods" },
    ],
    keyTakeaways: [
      "Most first-night stress is solved by clear arrival and sign-up planning.",
      "Supportive rooms reward respect, preparation, and realistic goals.",
      "Public venue pages reduce last-minute confusion for everyone.",
    ],
    relatedDiscoveryLinks: [
      { href: "/find-open-mics", label: "Find an open mic" },
      { href: "/map", label: "Browse the venue map" },
      { href: "/venues", label: "Read venue pages before you go" },
    ],
  },
  {
    slug: "how-micstage-helps-venues-and-performers-connect",
    title: "How MicStage helps venues and performers connect",
    description:
      "MicStage focuses on accurate schedules, booking visibility, and discovery—so performers can find the right room and venues can fill slots with less back-and-forth.",
    category: "strategy",
    readingMinutes: 6,
    publishedAt: "2026-04-13",
    updatedAt: "2026-04-13",
    intro:
      "MicStage is built around a simple idea: open mics work better when everyone shares the same source of truth. Venues keep public pages current, performers discover nights that fit their act, and communities can explore what is happening nearby—without replacing the human judgment of a good host.",
    practicalTips: [
      "Venue teams: treat your MicStage page as the canonical schedule—update changes once, link to it from social posts.",
      "Performers: verify slot status on the venue page before you travel; if something looks off, message the venue early.",
      "Use the map and find tools together: map for geography, listings for filters and details.",
      "If you are new to a city, start with one room for several weeks before bouncing—relationships compound.",
    ],
    sections: [
      {
        heading: "Discovery that respects real-world logistics",
        paragraphs: [
          "People discover open mics through search, maps, and word of mouth. MicStage’s discovery pages are designed to reduce ambiguity: where the room is, when the event runs, and how booking works.",
          "That clarity helps performers self-select into rooms that match their format and helps venues attract fewer mismatched acts.",
        ],
      },
      {
        heading: "Schedules and booking visibility",
        paragraphs: [
          "When schedules are visible and slot availability is understandable, performers spend less time coordinating and more time rehearsing.",
          "Venues benefit from fewer repetitive questions and a smoother door experience because expectations are aligned before arrival.",
        ],
      },
      {
        heading: "Community-scale browsing",
        paragraphs: [
          "Location pages help people understand what is active in an area—not only a single venue. That supports neighborhood-level culture without forcing every venue into the same template.",
        ],
      },
    ],
    faq: [
      {
        q: "Does MicStage replace a host?",
        a: "No. A good host still sets tone, timing, and fairness. MicStage reduces friction around information and discovery so hosts can focus on the room.",
      },
      {
        q: "Is MicStage only for musicians?",
        a: "MicStage supports open mic culture broadly. Format specifics still come from the venue and the host team.",
      },
      {
        q: "Where should I start if I am brand new?",
        a: "Use find and map to locate a nearby night, read the venue page, then read “what to expect at your first open mic” before you go.",
      },
    ],
    relatedGuides: [
      { slug: "what-to-expect-at-your-first-open-mic", label: "Your first open mic" },
      { slug: "how-to-run-a-successful-open-mic-night", label: "Run a successful open mic" },
      { slug: "what-performers-look-for-in-open-mics", label: "What performers look for" },
    ],
    keyTakeaways: [
      "Shared public details reduce friction for venues and performers.",
      "Discovery tools work best when venue pages stay accurate.",
      "MicStage complements hosts—it does not replace them.",
    ],
    relatedDiscoveryLinks: [
      { href: "/find-open-mics", label: "Find open mics" },
      { href: "/map", label: "Open mic map" },
      { href: "/venues", label: "Venue directory" },
      { href: "/locations", label: "Locations" },
      { href: "/performers", label: "Performers" },
    ],
  },
];

export function getAllResourceArticles(): ResourceArticle[] {
  return [...ARTICLES];
}

export function getResourceArticleBySlug(slug: string): ResourceArticle | null {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}
