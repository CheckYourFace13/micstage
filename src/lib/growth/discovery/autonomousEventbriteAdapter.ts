import { discoveryRollupSlugFromCityRegion } from "@/lib/discoveryMarket";
import { isNationalDiscoveryMarket, nationalDiscoveryMarketSlug } from "@/lib/growth/marketsConfig";
import {
  growthDiscoveryAutonomousEnabled,
  growthDiscoveryHttpDelayMs,
  growthEventbriteToken,
  hasEventbriteToken,
} from "@/lib/growth/discovery/autonomousConfig";
import { readDiscoveryCursor, writeDiscoveryCursor } from "@/lib/growth/discovery/discoveryCursor";
import { eventbriteUsLocationAddresses } from "@/lib/growth/discovery/usStateGeoScopes";
import { scoreOpenMicVenueProspect } from "@/lib/growth/discovery/venueOpenMicSignals";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import type { GrowthLeadDiscoveryContext, GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";
import { deriveVenueContactQuality } from "@/lib/growth/venueContactQuality";

/** Keep id stable for cursor / metrics continuity (behavior is US-wide state rotation). */
const ADAPTER_ID = "autonomous_eventbrite_chicago";
const CURSOR_KEY = "eb_page";
const EVENTBRITE_QUERIES = ["open mic", "poetry open mic", "comedy open mic", "jam night"];
const US_LOCATIONS = eventbriteUsLocationAddresses();

type EbVenue = { name?: string; address?: { city?: string; region?: string } };
type EbEvent = {
  id: string;
  name?: { text?: string };
  description?: { text?: string };
  url?: string;
  venue?: EbVenue;
  venue_id?: string;
};

const OPEN_MIC_EVENT_RE =
  /\bopen\s*mic\b|\bmic\s*night\b|\bjam\s*night\b|\bacoustic\s*(night|open)\b|\bcomedy\s*open\b|\bpoetry\s*open\b|\bopen\s*stage\b|\bamateur\s*night\b/i;

function eventText(ev: EbEvent): string {
  const name = ev.name?.text ?? "";
  const desc = typeof ev.description?.text === "string" ? ev.description.text : "";
  return `${name}\n${desc}`.slice(0, 8000);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Paginates Eventbrite public search across every US state (+ DC), scoped to open-mic–style events.
 * Runs on the nationwide discovery lane.
 */
export function createAutonomousEventbriteVenueAdapter(): GrowthLeadSourceAdapter {
  return {
    id: ADAPTER_ID,
    leadType: "VENUE",
    async discover(ctx: GrowthLeadDiscoveryContext) {
      if (!growthDiscoveryAutonomousEnabled()) return [];
      if (!isNationalDiscoveryMarket(ctx.discoveryMarketSlug)) return [];
      if (!hasEventbriteToken() || !ctx.prisma) return [];

      const token = growthEventbriteToken();
      const prisma = ctx.prisma;
      let page = 1;
      let queryIndex = 0;
      let locationIndex = 0;
      try {
        const raw = await readDiscoveryCursor(prisma, ADAPTER_ID, ctx.discoveryMarketSlug, CURSOR_KEY);
        const parsed = raw
          ? (JSON.parse(raw) as { page?: number; queryIndex?: number; locationIndex?: number })
          : null;
        page = Math.max(1, Number(parsed?.page ?? 1) || 1);
        queryIndex = Math.max(0, Number(parsed?.queryIndex ?? 0) || 0) % EVENTBRITE_QUERIES.length;
        locationIndex = Math.max(0, Number(parsed?.locationIndex ?? 0) || 0) % US_LOCATIONS.length;
      } catch {
        page = 1;
        queryIndex = 0;
        locationIndex = 0;
      }
      const query = EVENTBRITE_QUERIES[queryIndex]!;
      const locationAddress = US_LOCATIONS[locationIndex]!;

      await sleep(growthDiscoveryHttpDelayMs());

      const u = new URL("https://www.eventbriteapi.com/v3/events/search/");
      u.searchParams.set("location.address", locationAddress);
      u.searchParams.set("location.within", process.env.GROWTH_EVENTBRITE_RADIUS_KM?.trim() || "120km");
      u.searchParams.set("page", String(page));
      u.searchParams.set("expand", "venue");
      u.searchParams.set("q", query);

      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 25_000);
      let data: { events?: EbEvent[]; pagination?: { page_count?: number } } = {};
      try {
        const res = await fetch(u.toString(), {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
        });
        if (!res.ok) {
          console.warn("[growth discovery] Eventbrite API", res.status, await res.text().catch(() => ""));
          return [];
        }
        data = (await res.json()) as typeof data;
      } catch (e) {
        console.warn("[growth discovery] Eventbrite fetch error", e);
        return [];
      } finally {
        clearTimeout(t);
      }

      const events = data.events ?? [];
      const pageCount = data.pagination?.page_count ?? page;
      const wrapped = page >= pageCount;
      const nextPage = wrapped ? 1 : page + 1;
      let nextQueryIndex = queryIndex;
      let nextLocationIndex = locationIndex;
      if (wrapped) {
        nextQueryIndex = (queryIndex + 1) % EVENTBRITE_QUERIES.length;
        if (nextQueryIndex === 0) {
          nextLocationIndex = (locationIndex + 1) % US_LOCATIONS.length;
        }
      }
      await writeDiscoveryCursor(
        prisma,
        ADAPTER_ID,
        ctx.discoveryMarketSlug,
        CURSOR_KEY,
        JSON.stringify({ page: nextPage, queryIndex: nextQueryIndex, locationIndex: nextLocationIndex }),
      );

      const out: GrowthLeadCandidate[] = [];
      for (const ev of events) {
        const blob = eventText(ev);
        if (!OPEN_MIC_EVENT_RE.test(blob)) continue;

        const v = ev.venue;
        const name =
          (v?.name && String(v.name).trim()) ||
          (ev.name?.text ? ev.name.text.trim().slice(0, 180) : null) ||
          "Open mic event host";
        const city = v?.address?.city?.trim() || null;
        const region = v?.address?.region?.trim()?.toUpperCase() || null;
        const discoveryMarketSlug =
          city && region ? discoveryRollupSlugFromCityRegion(city, region) : nationalDiscoveryMarketSlug();

        const om = scoreOpenMicVenueProspect({
          snippet: ev.name?.text ?? "",
          pageTextSample: blob,
          title: ev.name?.text ?? "",
          searchQuery: `open mic Eventbrite ${locationAddress}`,
          hasEmail: false,
          hasContactPath: Boolean(ev.url),
          hasSocial: false,
        });

        const contactQuality = deriveVenueContactQuality({
          email: null,
          contactUrl: ev.url ?? null,
          instagramUrl: null,
          facebookUrl: null,
        });

        out.push({
          leadType: "VENUE",
          name,
          websiteUrl: ev.url?.split("?")[0] ?? null,
          contactUrl: ev.url ?? null,
          city,
          region,
          discoveryMarketSlug,
          source: ADAPTER_ID,
          sourceKind: "EVENT_LISTING",
          fitScore: Math.max(om.fitScore, 6),
          discoveryConfidence: Math.max(om.confidence, 48),
          openMicSignalTier: om.tier,
          contactQuality,
          performanceTags: om.performanceTags.length ? om.performanceTags : [],
          importKey: `eb_evt:${ev.id}`,
          internalNotes: `Eventbrite search (${query} @ ${locationAddress}, radius ${u.searchParams.get("location.within")}). Verify venue before outreach.`,
        });
      }
      return out;
    },
  };
}
