import { CHICAGOLAND_SLUG } from "@/lib/growth/data/chicagolandDiscoverySeeds";
import {
  growthDiscoveryAutonomousEnabled,
  growthDiscoveryHttpDelayMs,
  growthEventbriteToken,
  hasEventbriteToken,
} from "@/lib/growth/discovery/autonomousConfig";
import { readDiscoveryCursor, writeDiscoveryCursor } from "@/lib/growth/discovery/discoveryCursor";
import { scoreOpenMicVenueProspect } from "@/lib/growth/discovery/venueOpenMicSignals";
import type { GrowthLeadCandidate } from "@/lib/growth/growthLeadCandidate";
import type { GrowthLeadDiscoveryContext, GrowthLeadSourceAdapter } from "@/lib/growth/sources/growthLeadSourceAdapter";
import { deriveVenueContactQuality } from "@/lib/growth/venueContactQuality";

const ADAPTER_ID = "autonomous_eventbrite_chicago";
const CURSOR_KEY = "eb_page";

type EbVenue = { name?: string; address?: { city?: string; region?: string } };
type EbEvent = {
  id: string;
  name?: { text?: string };
  description?: { text?: string };
  url?: string;
  venue?: EbVenue;
  venue_id?: string;
};

const OPEN_MIC_EVENT_RE = /\bopen\s*mic\b|\bmic\s*night\b|\bjam\s*night\b|\bacoustic\s*(night|open)\b|\bcomedy\s*open\b|\bpoetry\s*open\b|\bopen\s*stage\b|\bamateur\s*night\b/i;

function eventText(ev: EbEvent): string {
  const name = ev.name?.text ?? "";
  const desc = typeof ev.description?.text === "string" ? ev.description.text : "";
  return `${name}\n${desc}`.slice(0, 8000);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Paginates Eventbrite public search near Chicago, scoped to open-mic–style events.
 */
export function createAutonomousEventbriteVenueAdapter(): GrowthLeadSourceAdapter {
  return {
    id: ADAPTER_ID,
    leadType: "VENUE",
    async discover(ctx: GrowthLeadDiscoveryContext) {
      if (!growthDiscoveryAutonomousEnabled()) return [];
      if (ctx.discoveryMarketSlug.trim().toLowerCase() !== CHICAGOLAND_SLUG) return [];
      if (!hasEventbriteToken() || !ctx.prisma) return [];

      const token = growthEventbriteToken();
      const prisma = ctx.prisma;
      let page = Number.parseInt((await readDiscoveryCursor(prisma, ADAPTER_ID, ctx.discoveryMarketSlug, CURSOR_KEY)) ?? "1", 10) || 1;
      if (page < 1) page = 1;

      await sleep(growthDiscoveryHttpDelayMs());

      const u = new URL("https://www.eventbriteapi.com/v3/events/search/");
      u.searchParams.set("location.address", "Chicago, IL");
      u.searchParams.set("location.within", "40km");
      u.searchParams.set("page", String(page));
      u.searchParams.set("expand", "venue");
      u.searchParams.set("q", "open mic");

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
      const nextPage = page >= pageCount ? 1 : page + 1;
      await writeDiscoveryCursor(prisma, ADAPTER_ID, ctx.discoveryMarketSlug, CURSOR_KEY, String(nextPage));

      const out: GrowthLeadCandidate[] = [];
      for (const ev of events) {
        const blob = eventText(ev);
        if (!OPEN_MIC_EVENT_RE.test(blob)) continue;

        const v = ev.venue;
        const name =
          (v?.name && String(v.name).trim()) ||
          (ev.name?.text ? ev.name.text.trim().slice(0, 180) : null) ||
          "Chicago area event host";
        const city = v?.address?.city?.trim() || "Chicago";
        const region = v?.address?.region?.trim() || "IL";

        const om = scoreOpenMicVenueProspect({
          snippet: ev.name?.text ?? "",
          pageTextSample: blob,
          title: ev.name?.text ?? "",
          searchQuery: "open mic Eventbrite Chicago",
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
          discoveryMarketSlug: CHICAGOLAND_SLUG,
          source: ADAPTER_ID,
          sourceKind: "EVENT_LISTING",
          fitScore: Math.max(om.fitScore, 6),
          discoveryConfidence: Math.max(om.confidence, 48),
          openMicSignalTier: om.tier,
          contactQuality,
          performanceTags: om.performanceTags.length ? om.performanceTags : [],
          importKey: `eb_evt:${ev.id}`,
          internalNotes: "Eventbrite search (Chicago radius, open-mic query). Verify venue before outreach.",
        });
      }
      return out;
    },
  };
}
