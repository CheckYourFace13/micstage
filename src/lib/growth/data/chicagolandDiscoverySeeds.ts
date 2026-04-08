/**
 * Curated discovery seeds for the primary launch metro (today: Chicagoland data).
 * Lead rows use `discoveryMarketSlug` from `primaryLaunchDiscoveryMarketSlug()` in adapters — not hardcoded here.
 * Not exhaustive; extend as you validate contacts. Dedupe via stable `importKey`.
 */

export type VenueWebsiteSeed = {
  importKey: string;
  name: string;
  websiteUrl: string;
  contactUrl?: string;
  city: string;
  suburb?: string;
  discoveryConfidence: number;
  fitScore?: number;
  source: string;
};

export type VenueSocialSeed = {
  importKey: string;
  name: string;
  instagramUrl: string;
  /** Omit when the same host is already ingested via website adapter (dedupe by websiteHost). */
  websiteUrl?: string;
  city: string;
  suburb?: string;
  discoveryConfidence: number;
  fitScore?: number;
  source: string;
};

export type EventListingVenueSeed = {
  importKey: string;
  name: string;
  /** Listing or events page (open mic / showcase). */
  contactUrl: string;
  websiteUrl?: string;
  city: string;
  suburb?: string;
  discoveryConfidence: number;
  fitScore?: number;
  source: string;
};

export type ArtistSocialSeed = {
  importKey: string;
  name: string;
  instagramUrl?: string;
  youtubeUrl?: string;
  websiteUrl?: string;
  city: string;
  suburb?: string;
  discoveryConfidence: number;
  fitScore?: number;
  source: string;
};

export type PromoterSocialSeed = {
  importKey: string;
  name: string;
  instagramUrl?: string;
  websiteUrl?: string;
  contactUrl?: string;
  city: string;
  discoveryConfidence: number;
  fitScore?: number;
  source: string;
};

/** Venue home / contact-oriented discovery (book-the-room outreach). */
export const CHICAGOLAND_VENUE_WEBSITE_SEEDS: VenueWebsiteSeed[] = [
  {
    importKey: "chi-venue-green-mill",
    name: "Green Mill Cocktail Lounge",
    websiteUrl: "https://www.greenmilljazz.com",
    contactUrl: "https://www.greenmilljazz.com/contact",
    city: "Chicago",
    suburb: "Uptown",
    discoveryConfidence: 72,
    fitScore: 8,
    source: "chicagoland_curated_venue_web",
  },
  {
    importKey: "chi-venue-hideout",
    name: "The Hideout",
    websiteUrl: "https://hideoutchicago.com",
    contactUrl: "https://hideoutchicago.com/contact/",
    city: "Chicago",
    discoveryConfidence: 70,
    fitScore: 8,
    source: "chicagoland_curated_venue_web",
  },
  {
    importKey: "chi-venue-beat-kitchen",
    name: "Beat Kitchen",
    websiteUrl: "https://beatkitchen.com",
    city: "Chicago",
    suburb: "Roscoe Village",
    discoveryConfidence: 68,
    fitScore: 7,
    source: "chicagoland_curated_venue_web",
  },
  {
    importKey: "chi-venue-subterranean",
    name: "Subterranean",
    websiteUrl: "https://subt.net",
    city: "Chicago",
    suburb: "Wicker Park",
    discoveryConfidence: 66,
    fitScore: 7,
    source: "chicagoland_curated_venue_web",
  },
  {
    importKey: "chi-venue-martyrs",
    name: "Martyrs'",
    websiteUrl: "https://martyrslive.com",
    city: "Chicago",
    suburb: "North Center",
    discoveryConfidence: 65,
    fitScore: 7,
    source: "chicagoland_curated_venue_web",
  },
  {
    importKey: "chi-venue-fitzgeralds",
    name: "FitzGerald's Nightclub",
    websiteUrl: "https://fitzgeraldsnightclub.com",
    city: "Berwyn",
    discoveryConfidence: 64,
    fitScore: 7,
    source: "chicagoland_curated_venue_web",
  },
  {
    importKey: "chi-venue-cubby-bear",
    name: "Cubby Bear",
    websiteUrl: "https://cubbybear.com",
    city: "Chicago",
    suburb: "Wrigleyville",
    discoveryConfidence: 62,
    fitScore: 6,
    source: "chicagoland_curated_venue_web",
  },
  {
    importKey: "chi-venue-laugh-factory-chicago",
    name: "Laugh Factory Chicago",
    websiteUrl: "https://www.laughfactory.com/clubs/chicago/",
    city: "Chicago",
    discoveryConfidence: 70,
    fitScore: 8,
    source: "chicagoland_curated_venue_web",
  },
  {
    importKey: "chi-venue-comedy-bar",
    name: "Comedy Bar",
    websiteUrl: "https://comedybar.com",
    city: "Chicago",
    discoveryConfidence: 71,
    fitScore: 8,
    source: "chicagoland_curated_venue_web",
  },
  {
    importKey: "chi-venue-second-city",
    name: "The Second City",
    websiteUrl: "https://www.secondcity.com",
    city: "Chicago",
    discoveryConfidence: 68,
    fitScore: 7,
    source: "chicagoland_curated_venue_web",
  },
  {
    importKey: "chi-venue-city-winery-chicago",
    name: "City Winery Chicago",
    websiteUrl: "https://citywinery.com/chicago",
    city: "Chicago",
    suburb: "West Loop",
    discoveryConfidence: 60,
    fitScore: 6,
    source: "chicagoland_curated_venue_web",
  },
  {
    importKey: "chi-venue-schubas",
    name: "Schubas Tavern",
    websiteUrl: "https://lh-st.com/Schubas",
    city: "Chicago",
    suburb: "Lakeview",
    discoveryConfidence: 63,
    fitScore: 7,
    source: "chicagoland_curated_venue_web",
  },
];

/** Venue Instagram-first discovery (talent-booking / marketing DMs). */
export const CHICAGOLAND_VENUE_SOCIAL_SEEDS: VenueSocialSeed[] = [
  {
    importKey: "chi-venue-ig-green-mill",
    name: "Green Mill (Instagram)",
    instagramUrl: "https://www.instagram.com/greenmilljazz/",
    city: "Chicago",
    discoveryConfidence: 58,
    fitScore: 6,
    source: "chicagoland_curated_venue_ig",
  },
  {
    importKey: "chi-venue-ig-burlington",
    name: "The Burlington Bar (Instagram)",
    instagramUrl: "https://www.instagram.com/theburlingtonbar/",
    city: "Chicago",
    suburb: "Logan Square",
    discoveryConfidence: 55,
    fitScore: 6,
    source: "chicagoland_curated_venue_ig",
  },
  {
    importKey: "chi-venue-ig-empty-bottle",
    name: "Empty Bottle (Instagram)",
    instagramUrl: "https://www.instagram.com/emptybottle/",
    city: "Chicago",
    discoveryConfidence: 56,
    fitScore: 6,
    source: "chicagoland_curated_venue_ig",
  },
  {
    importKey: "chi-venue-ig-color-club",
    name: "Color Club (Instagram)",
    instagramUrl: "https://www.instagram.com/colorclubchicago/",
    city: "Chicago",
    discoveryConfidence: 54,
    fitScore: 6,
    source: "chicagoland_curated_venue_ig",
  },
  {
    importKey: "chi-venue-ig-reggies",
    name: "Reggies Music Joint (Instagram)",
    instagramUrl: "https://www.instagram.com/reggieslive/",
    city: "Chicago",
    suburb: "South Loop",
    discoveryConfidence: 55,
    fitScore: 6,
    source: "chicagoland_curated_venue_ig",
  },
];

/**
 * Open mic / showcase listing pages (venue-oriented rows: research the room + recurring night).
 */
export const CHICAGOLAND_EVENT_LISTING_VENUE_SEEDS: EventListingVenueSeed[] = [
  {
    importKey: "chi-listing-sofar-sounds-chicago",
    name: "Sofar Sounds — Chicago listings",
    contactUrl: "https://www.sofarsounds.com/chicago",
    city: "Chicago",
    discoveryConfidence: 48,
    fitScore: 5,
    source: "chicagoland_curated_event_listing",
  },
  {
    importKey: "chi-listing-do312-live-music",
    name: "Do312 live music calendar",
    contactUrl: "https://do312.com/events/live-music",
    city: "Chicago",
    discoveryConfidence: 45,
    fitScore: 5,
    source: "chicagoland_curated_event_listing",
  },
  {
    importKey: "chi-listing-chicago-theatre-weekly",
    name: "Chicago Reader music & nightlife",
    contactUrl: "https://chicagoreader.com/chicago/MusicIssue/archives/",
    city: "Chicago",
    discoveryConfidence: 50,
    fitScore: 5,
    source: "chicagoland_curated_event_listing",
  },
  {
    importKey: "chi-listing-metromix-chicago-music",
    name: "NBC Chicago / local events (music)",
    contactUrl: "https://www.nbcchicago.com/entertainment/the-scene/",
    city: "Chicago",
    discoveryConfidence: 42,
    fitScore: 4,
    source: "chicagoland_curated_event_listing",
  },
  {
    importKey: "chi-listing-open-mic-search-eventbrite",
    name: "Eventbrite — Chicago open mic search",
    contactUrl: "https://www.eventbrite.com/d/il--chicago/open-mic/",
    city: "Chicago",
    discoveryConfidence: 40,
    fitScore: 4,
    source: "chicagoland_curated_event_listing",
  },
];

/** Artist-facing discovery (public social / web; verify before outreach). */
export const CHICAGOLAND_ARTIST_SOCIAL_SEEDS: ArtistSocialSeed[] = [
  {
    importKey: "chi-artist-seed-lincoln-square-songwriter",
    name: "Lincoln Square songwriter circle (research cluster)",
    instagramUrl: "https://www.instagram.com/explore/tags/chicagomusic/",
    city: "Chicago",
    suburb: "Lincoln Square",
    discoveryConfidence: 35,
    fitScore: 4,
    source: "chicagoland_curated_artist_social",
  },
  {
    importKey: "chi-artist-seed-open-mic-hashtag",
    name: "Chicago open mic hashtag (prospect pool)",
    instagramUrl: "https://www.instagram.com/explore/tags/chicagoopenmic/",
    city: "Chicago",
    discoveryConfidence: 33,
    fitScore: 4,
    source: "chicagoland_curated_artist_social",
  },
  {
    importKey: "chi-artist-seed-chicago-musicians-collective",
    name: "Chicago musicians collective (research)",
    youtubeUrl: "https://www.youtube.com/results?search_query=chicago+open+mic+2025",
    city: "Chicago",
    discoveryConfidence: 30,
    fitScore: 3,
    source: "chicagoland_curated_artist_social",
  },
  {
    importKey: "chi-artist-seed-evanston-folk",
    name: "Evanston acoustic / folk scene (research)",
    city: "Evanston",
    websiteUrl: "https://www.cityofevanston.org/",
    discoveryConfidence: 28,
    fitScore: 3,
    source: "chicagoland_curated_artist_social",
  },
  {
    importKey: "chi-artist-seed-oak-park-music",
    name: "Oak Park live music (research)",
    city: "Oak Park",
    websiteUrl: "https://www.oak-park.us/",
    discoveryConfidence: 28,
    fitScore: 3,
    source: "chicagoland_curated_artist_social",
  },
];

/** Promoters, rooms, and multi-venue producers. */
export const CHICAGOLAND_PROMOTER_SOCIAL_SEEDS: PromoterSocialSeed[] = [
  {
    importKey: "chi-promoter-chicago-comedy-works",
    name: "Chicago comedy producer cluster (research)",
    websiteUrl: "https://www.laughfactory.com/clubs/chicago/",
    city: "Chicago",
    discoveryConfidence: 44,
    fitScore: 5,
    source: "chicagoland_curated_promoter",
  },
  {
    importKey: "chi-promoter-choose-chicago-events",
    name: "Choose Chicago — events hub",
    contactUrl: "https://www.choosechicago.com/events/",
    city: "Chicago",
    discoveryConfidence: 46,
    fitScore: 5,
    source: "chicagoland_curated_promoter",
  },
  {
    importKey: "chi-promoter-auditorium-theatre",
    name: "Auditorium Theatre events",
    websiteUrl: "https://www.auditoriumtheatre.org",
    city: "Chicago",
    discoveryConfidence: 42,
    fitScore: 4,
    source: "chicagoland_curated_promoter",
  },
];
