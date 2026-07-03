/**
 * Self-check for the shared listing-name classifier
 * (scripts/lib/listingNameClassifier.mjs, mirror of
 * src/lib/publicListings/listingQuality.ts).
 *
 * Asserts the required rejected/allowed cases from the name-classifier brief.
 * Exits non-zero on any mismatch so it can gate CI / pre-deploy.
 *
 * Usage: node scripts/check-listing-name-classifier.mjs
 */
import { classifyListingName, isPublicListingNameOk } from "./lib/listingNameClassifier.mjs";

// Aggregator / directory / bare city+open-mic names — must be rejected.
const MUST_REJECT = [
  "Open Mic Portland",
  "Open Mic Los Angeles",
  "Open Mic Chicago",
  "Open Mic NYC",
  "Open Mic Comedy Night",
  "Open Mic Night",
  "Open Mics",
  "Open Mic List",
  "Open Mic Info",
  "Open Mic Venues",
  "Open Mic Calendar",
  "Open Mic Events",
  "Chicago Open Mics",
  "San Diego Open Mics",
  "Illinois Open Mics",
  "Portland open mics",
  "Oregon open mics",
  "open mic nights in Chicago",
  "open mics near me",
  "find open mics",
  "open mics and jams",
  "open mic guide",
  "open mic resource guide",
  "Open Mic Nights in NYC Resource Guide",
  // article / landing-page / aggregator phrasing (even with an "at <x>" fragment)
  "Open mic nights flourish at South Evanston venues",
  "Jacksonville Open Mic Meetup Group",
  "Arts Agenda: Open mics",
  "Shows and Open Mics",
  "Boston Area Open Mics and Poetry Slams",
  "San Diego County Open Mics & Poetry Classes: Support Our Poetry, Music, & Art Communities!",
  "Open Mic Comedy Denver: Get on Stage Tonight!",
  "An Open Mic for Every Night of the Week",
  "Most Best Open Mic",
  // article / headline sentences (verb after "open mic(s)")
  "Open Mic Nights Showcase Talent in the Philadelphia Suburbs",
  "Open Mic Nights Flourish at South Evanston Venues",
  "Open Mics Showcase Local Talent",
  "Open Mics Bring Community Together",
];

// Real venue / event names — must pass.
const MUST_ALLOW = [
  "Open Mic @ The Cove Lounge",
  "Open Mic Night at Downtown Comedy Lounge",
  "Cole's Comedy Open Mic",
  "Philly Rising Open Mic presented by REC Philly",
  "Poetry Open Mic at Gallery Cabaret",
  "Live Music & Open Mic at The Wolf Cafe",
  "New Orleans Youth Open Mic Night",
  "Rambling House Open Mic",
  "Avalon Park Open Mic Night & Community Kick Back",
];

const failures = [];

for (const name of MUST_REJECT) {
  const reason = classifyListingName(name);
  if (reason === null) failures.push(`SHOULD REJECT but passed: ${JSON.stringify(name)}`);
}
for (const name of MUST_ALLOW) {
  if (!isPublicListingNameOk(name)) {
    failures.push(`SHOULD ALLOW but rejected (${classifyListingName(name)}): ${JSON.stringify(name)}`);
  }
}

if (failures.length) {
  console.error("Listing-name classifier self-check FAILED:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

console.log(
  `Listing-name classifier self-check passed: ${MUST_REJECT.length} rejected, ${MUST_ALLOW.length} allowed.`,
);
