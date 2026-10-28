export const dynamic = "force-static";

/**
 * Public llms.txt — concise machine-readable site map for AI crawlers.
 * Links only to existing public canonical pages. No private APIs or admin routes.
 */
const BODY = `# MicStage
> Nationwide open-mic discovery plus free tools for hosts and venues.

Site: https://micstage.com
Purpose: Help performers find verified open mics, and help hosts/venues run nights with free MicStage tools.

## Primary discovery
- https://micstage.com/find-open-mics
- https://micstage.com/map
- https://micstage.com/venues
- https://micstage.com/locations
- https://micstage.com/locations/chicago-il/open-mics

## Resources and guides
- https://micstage.com/resources
- https://micstage.com/resources/how-micstage-verifies-open-mic-listings
- https://micstage.com/resources/list-your-open-mic-venue-on-micstage
- https://micstage.com/resources/how-micstage-helps-venues-and-performers-connect
- https://micstage.com/resources/open-mic-gear

## How listings are verified
Verified listings need a real place identity plus explicit open-mic evidence tied to that room.
Search snippets and directory listicles alone are not enough. Schedules are shown only when known;
missing fields stay blank until confirmed.
Details: https://micstage.com/resources/how-micstage-verifies-open-mic-listings

## FAQ / about / contact
- https://micstage.com/faq
- https://micstage.com/about
- https://micstage.com/contact
- https://micstage.com/host
- https://micstage.com/why/venue-controlled-structure

## Optional
- https://micstage.com/compare
- https://micstage.com/performers
`;

export function GET() {
  return new Response(BODY, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
