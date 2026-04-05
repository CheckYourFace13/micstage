/**
 * Social copy for future scheduling — no API posts in phase 1.
 */
export type MarketingSocialPlatform = "generic";

export type MarketingSocialPayload = {
  platform: MarketingSocialPlatform;
  text: string;
  suggestedUrls: string[];
  hashtags: string[];
};

export function buildVenueDiscoverySocialPayloads(input: {
  venueName: string;
  discoveryLabel: string | null;
  publicVenueUrl: string;
  publicLocationPerformersUrl: string | null;
}): MarketingSocialPayload[] {
  const loc = input.discoveryLabel ? ` in ${input.discoveryLabel}` : "";
  const lines = [
    `${input.venueName}${loc} — MicStage helps market your open mic for free (public lineup + discovery).`,
    input.publicLocationPerformersUrl
      ? `Performers & guests: ${input.publicLocationPerformersUrl}`
      : `Venue page: ${input.publicVenueUrl}`,
    "#openmic #livemusic",
  ];
  return [
    {
      platform: "generic",
      text: lines.join("\n\n"),
      suggestedUrls: [input.publicVenueUrl, input.publicLocationPerformersUrl].filter(Boolean) as string[],
      hashtags: ["openmic", "livemusic", "micstage"],
    },
  ];
}
