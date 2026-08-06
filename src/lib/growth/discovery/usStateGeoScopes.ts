/**
 * US-wide discovery geo tails — every state + DC (no metro shortlist / Chicago bias).
 * Used by SerpAPI/Brave query rotation and Eventbrite location paging.
 */

/** Full state / district names for `"open mic" {geo}` style queries. */
export const US_STATE_GEO_SCOPES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
  "Washington DC",
] as const;

/** Postal abbreviations aligned 1:1 with {@link US_STATE_GEO_SCOPES} (DC last). */
export const US_STATE_ABBREVS = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
] as const;

/**
 * Web-search geo rotation: US-wide buckets first, then every state equally.
 * Empty string = core query with no geo tail (already includes some US-wide cores).
 */
export function nationwideWebSearchGeoScopes(): string[] {
  return ["", "United States", ...US_STATE_GEO_SCOPES];
}

/** Eventbrite `location.address` values — one per state/district. */
export function eventbriteUsLocationAddresses(): string[] {
  return US_STATE_GEO_SCOPES.map((name, i) => {
    const abbr = US_STATE_ABBREVS[i]!;
    if (abbr === "DC") return "Washington, DC";
    return `${name}, ${abbr}`;
  });
}
