import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import {
  createGrowthLeadAction,
  importGrowthLeadsCsvAction,
} from "@/app/internal/admin/growthActions";
import { loadGrowthDailyActivityStats } from "@/lib/growth/growthDailyActivity";
import { loadGrowthFunnelMetrics, loadGrowthMarketMetrics } from "@/lib/growth/marketMetrics";
import { growthDiscoveryAllocationSummary } from "@/lib/growth/growthDiscoveryAllocation";
import { listGrowthDiscoveryAdapterRegistry } from "@/lib/growth/discoveryAdapterCatalog";
import {
  defaultGrowthMetro,
  GROWTH_METROS,
  primaryLaunchDiscoveryMarketSlug,
  resolveGrowthMarketSlug,
} from "@/lib/growth/marketsConfig";
import {
  growthFollowUpAutomationEnabled,
  marketingContactCooldownHours,
  marketingDailyCap,
  marketingPerDomainDailyCap,
} from "@/lib/marketing/emailConfig";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminGrowthHubPage(props: {
  searchParams: Promise<{
    market?: string;
    metro?: string;
    ok?: string;
    err?: string;
    importInserted?: string;
    importFailed?: string;
    importDuplicates?: string;
    parseErrs?: string;
  }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();

  const marketSlug = resolveGrowthMarketSlug({ market: params.market, metro: params.metro });
  const metroConfig =
    GROWTH_METROS.find((m) => m.discoveryMarketSlug.toLowerCase() === marketSlug.toLowerCase()) ?? defaultGrowthMetro();

  const marketEq = { discoveryMarketSlug: { equals: marketSlug, mode: "insensitive" as const } };

  const [metrics, funnel, overallFunnel, daily, byType, total, launchRows, venueSignalBreakdown, venueAcqBreakdown] =
    await Promise.all([
      loadGrowthMarketMetrics(prisma, marketSlug),
      loadGrowthFunnelMetrics(prisma, marketSlug),
      loadGrowthFunnelMetrics(prisma, null),
      loadGrowthDailyActivityStats(prisma),
      prisma.growthLead.groupBy({
        by: ["leadType"],
        where: marketEq,
        _count: { _all: true },
      }),
      prisma.growthLead.count({
        where: marketEq,
      }),
      prisma.growthLaunchMarket.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.growthLead.groupBy({
        by: ["openMicSignalTier"],
        where: { ...marketEq, leadType: "VENUE" },
        _count: { _all: true },
      }),
      prisma.growthLead.groupBy({
        by: ["acquisitionStage"],
        where: { ...marketEq, leadType: "VENUE" },
        _count: { _all: true },
      }),
    ]);

  const counts = Object.fromEntries(byType.map((g) => [g.leadType, g._count._all])) as Record<string, number>;
  const venueN = counts.VENUE ?? 0;
  const artistN = counts.ARTIST ?? 0;
  const promoterN = counts.PROMOTER_ACCOUNT ?? 0;
  const typedSum = venueN + artistN + promoterN;
  const venuePctOfTyped = typedSum > 0 ? Math.round((venueN / typedSum) * 100) : null;
  const chiSlug = defaultGrowthMetro().discoveryMarketSlug;
  const curatedDiscoveryAdapters = listGrowthDiscoveryAdapterRegistry().filter((a) => a.tier === "curated");
  const autonomousDiscoveryAdapters = listGrowthDiscoveryAdapterRegistry().filter((a) => a.tier === "autonomous");

  return (
    <main className="mx-auto max-w-5xl px-3 py-6">
      <h1 className="text-xl font-semibold text-white">Growth &amp; outbound</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-400">
        Market-by-market launch. Default is <strong className="text-zinc-200">{defaultGrowthMetro().label}</strong>. Leads:
        manual, CSV, and optional scheduled discovery jobs (adapters). Cold outreach stays{" "}
        <span className="text-zinc-300">draft → approve → send</span> — never mass auto-send. Only{" "}
        <strong className="text-zinc-200">ACTIVE</strong> launch markets may send; queued markets can accumulate leads and
        drafts. Follow-up automation:{" "}
        <span className="text-zinc-300">{growthFollowUpAutomationEnabled() ? "ON" : "OFF"}</span> (default off).
      </p>
      <p className="mt-2 max-w-2xl text-xs text-zinc-500">
        Cron: <code className="text-zinc-400">POST /api/cron/growth-pipeline</code> with{" "}
        <code className="text-zinc-400">GROWTH_LEAD_DISCOVERY_CRON_ENABLED</code> /{" "}
        <code className="text-zinc-400">GROWTH_AUTO_DRAFT_CRON_ENABLED</code>. Primary launch slug{" "}
        <code className="text-zinc-400">{primaryLaunchDiscoveryMarketSlug()}</code> from{" "}
        <code className="text-zinc-400">marketsConfig</code> (override list:{" "}
        <code className="text-zinc-400">GROWTH_DISCOVERY_MARKET_SLUGS</code>). Caps: outreach{" "}
        {marketingDailyCap("outreach")}/day · per-domain {marketingPerDomainDailyCap()}/day · contact cooldown{" "}
        {marketingContactCooldownHours()}h.
      </p>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-500">
        <span className="font-medium text-zinc-400">Autonomous adapters</span> (search/crawl/API — requires{" "}
        <code className="text-zinc-400">GROWTH_DISCOVERY_AUTONOMOUS_ENABLED=true</code> + keys):{" "}
        <span className="font-mono text-zinc-400">{autonomousDiscoveryAdapters.map((a) => a.id).join(", ")}</span>.
        <br />
        <span className="font-medium text-zinc-400">Curated static adapters</span>:{" "}
        <span className="font-mono text-zinc-400">{curatedDiscoveryAdapters.map((a) => a.id).join(", ")}</span>. Stub JSON:{" "}
        <span className="font-mono text-zinc-400">stub_json_*</span> via{" "}
        <code className="text-zinc-400">GROWTH_DISCOVERY_STUB_LEADS_JSON</code>. Cron returns{" "}
        <code className="text-zinc-400">adapterRegistry</code> + <code className="text-zinc-400">candidatesEmittedByAdapter</code>.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Link
          href="/internal/admin/growth/expansion"
          className="rounded border border-emerald-600/40 bg-emerald-950/30 px-2 py-1 text-emerald-200 hover:border-emerald-500"
        >
          Launch markets &amp; expansion →
        </Link>
        <span className="py-1 text-zinc-500">Market:</span>
        {GROWTH_METROS.map((m) => (
          <Link
            key={m.id}
            href={`/internal/admin/growth?market=${encodeURIComponent(m.discoveryMarketSlug)}`}
            className={`rounded border px-2 py-1 ${
              m.discoveryMarketSlug.toLowerCase() === marketSlug.toLowerCase()
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {m.label}
          </Link>
        ))}
        <Link
          href="/internal/admin/growth/leads"
          className="rounded border border-zinc-600 px-2 py-1 text-zinc-300 hover:border-zinc-500"
        >
          All filters →
        </Link>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        Viewing metrics for <code className="text-zinc-400">{marketSlug}</code>
        {metroConfig.label !== marketSlug ? ` (${metroConfig.label})` : ""}.
      </p>

      <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-medium text-white">Autonomous discovery (venue-only web search) &amp; funnel</h2>
        <p className="mt-1 text-xs text-zinc-500">{growthDiscoveryAllocationSummary()}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Cron JSON includes <code className="text-zinc-400">discoveryAllocationSummary</code> and{" "}
          <code className="text-zinc-400">effectiveCapsByAdapter</code> per run.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Leads in this market by type: VENUE {venueN}, ARTIST {artistN}, PROMOTER_ACCOUNT {promoterN}
          {venuePctOfTyped != null ? ` → venues ${venuePctOfTyped}% of typed leads (curated + autonomous; not a hard cap).` : "."}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs text-zinc-400">
          <div>
            <p className="font-medium text-zinc-300">Venue open-mic signal tier</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
              {venueSignalBreakdown.map((row) => (
                <li key={String(row.openMicSignalTier)}>
                  {(row.openMicSignalTier ?? "null") + ": " + row._count._all}
                </li>
              ))}
              {venueSignalBreakdown.length === 0 ? <li>—</li> : null}
            </ul>
          </div>
          <div>
            <p className="font-medium text-zinc-300">Venue acquisition stage</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
              {venueAcqBreakdown.map((row) => (
                <li key={row.acquisitionStage}>
                  {row.acquisitionStage}: {row._count._all}
                </li>
              ))}
              {venueAcqBreakdown.length === 0 ? <li>—</li> : null}
            </ul>
          </div>
        </div>
      </section>

      {params.err ? (
        <p className="mt-3 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {params.err === "duplicateLead"
            ? "That lead looks like a duplicate (email, website, Instagram, import key, or name+city in this market)."
            : params.err === "needMarket"
              ? "Discovery market slug is required."
              : params.err}
        </p>
      ) : null}
      {params.ok ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          Saved ({params.ok}).
        </p>
      ) : null}
      {params.importInserted !== undefined ? (
        <p className="mt-3 rounded border border-zinc-600/40 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
          CSV import: inserted {params.importInserted}, skipped duplicates {params.importDuplicates ?? "0"}, other skips{" "}
          {params.importFailed ?? "0"}, parse errors {params.parseErrs ?? "0"}. Check server logs for row details if
          failures &gt; 0.
        </p>
      ) : null}

      <section className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-lg font-medium text-white">Today (UTC)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Blocked sends = outreach pipeline rows with BLOCKED today. “Approved” uses leads in APPROVED with{" "}
          <code className="text-zinc-400">updatedAt</code> today (heuristic if you edited other fields).
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <FunnelStat label="Leads created" value={daily.leadsDiscovered} />
          <FunnelStat label="Approved (heuristic)" value={daily.leadsApprovedHeuristic} />
          <FunnelStat label="Drafts generated" value={daily.draftsGenerated} />
          <FunnelStat label="Growth sends (SENT)" value={daily.growthSendsCompleted} />
          <FunnelStat label="Outreach blocked" value={daily.outreachBlockedSends} warn />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-lg font-medium text-white">Launch markets (send gate)</h2>
        <p className="mt-1 text-xs text-zinc-500">Only ACTIVE rows may send cold growth outreach. Expansion cron unchanged.</p>
        <ul className="mt-3 space-y-1 text-sm text-zinc-300">
          {launchRows.map((m) => (
            <li key={m.id}>
              <span className="font-mono text-zinc-400">{m.discoveryMarketSlug}</span> · {m.label} ·{" "}
              <span className={m.status === "ACTIVE" ? "text-emerald-400" : "text-amber-200/90"}>{m.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-lg font-medium text-white">Funnel — this market ({marketSlug})</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Drafted = leads with a PENDING_REVIEW or APPROVED outreach draft. Sends = drafts marked SENT (this market).
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <FunnelStat label="Discovered" value={funnel.discovered} />
          <FunnelStat label="Reviewed" value={funnel.reviewed} />
          <FunnelStat label="Approved" value={funnel.approved} />
          <FunnelStat label="Drafted" value={funnel.drafted} />
          <FunnelStat label="Contacted" value={funnel.contacted} />
          <FunnelStat label="Replied" value={funnel.replied} />
          <FunnelStat label="Joined" value={funnel.joined} highlight />
          <FunnelStat label="Sends" value={funnel.outreachSends} />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <FunnelStat label="Reply logs (EMAIL)" value={funnel.replyLogsEmail} />
          <FunnelStat label="Bounced" value={funnel.bounced} warn />
          <FunnelStat label="Unsubscribed" value={funnel.unsubscribed} warn />
          <FunnelStat label="Rejected" value={funnel.rejected} />
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Legacy “discovered+review” count: {metrics.funnel.discoveredOrReview} (same as expansion health input).
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-lg font-medium text-white">Funnel — all markets</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <FunnelStat label="Discovered" value={overallFunnel.discovered} />
          <FunnelStat label="Reviewed" value={overallFunnel.reviewed} />
          <FunnelStat label="Approved" value={overallFunnel.approved} />
          <FunnelStat label="Drafted" value={overallFunnel.drafted} />
          <FunnelStat label="Contacted" value={overallFunnel.contacted} />
          <FunnelStat label="Replied" value={overallFunnel.replied} />
          <FunnelStat label="Joined" value={overallFunnel.joined} highlight />
          <FunnelStat label="Sends" value={overallFunnel.outreachSends} />
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Leads in market" value={total} />
        <Stat label="Venue leads" value={counts.VENUE ?? 0} />
        <Stat label="Artist leads" value={counts.ARTIST ?? 0} />
        <Stat label="Promoter / social" value={counts.PROMOTER_ACCOUNT ?? 0} />
      </section>

      <section className="mt-10 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-lg font-medium text-white">Saved views</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <Link
              className="text-emerald-400 hover:text-emerald-300"
              href={`/internal/admin/growth/leads?market=${encodeURIComponent(chiSlug)}&type=VENUE&pipeline=1`}
            >
              Chicagoland venues (pipeline)
            </Link>
          </li>
          <li>
            <Link
              className="text-emerald-400 hover:text-emerald-300"
              href={`/internal/admin/growth/leads?market=${encodeURIComponent(chiSlug)}&type=ARTIST&pipeline=1`}
            >
              Chicagoland artists (pipeline)
            </Link>
          </li>
          <li>
            <Link
              className="text-emerald-400 hover:text-emerald-300"
              href={`/internal/admin/growth/leads?market=${encodeURIComponent(chiSlug)}&type=PROMOTER_ACCOUNT&pipeline=1`}
            >
              Chicagoland promoters / accounts (pipeline)
            </Link>
          </li>
          <li>
            <Link
              className="text-amber-400/90 hover:text-amber-300"
              href={`/internal/admin/growth/leads?market=${encodeURIComponent(chiSlug)}&draftPending=1`}
            >
              Pending-review drafts (bulk review)
            </Link>
          </li>
          <li>
            <Link className="text-zinc-400 hover:text-white" href="/internal/admin/growth/venues">
              Legacy: venues list (same defaults)
            </Link>
          </li>
        </ul>
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-lg font-medium text-white">Import CSV (market defaults)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Empty row cells fall back to defaults below. Columns:{" "}
            <code className="text-zinc-400">
              name,leadType,contactEmail,...,city,suburb,region,discoveryMarketSlug,source,tags,importKey
            </code>
            . Tags merge with default tags.
          </p>
          <form action={importGrowthLeadsCsvAction} encType="multipart/form-data" className="mt-3 space-y-3">
            <label className="grid gap-1 text-xs">
              <span className="text-zinc-500">Default discovery market slug</span>
              <input
                name="defaultDiscoveryMarketSlug"
                defaultValue={marketSlug}
                className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-sm text-white"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs">
                <span className="text-zinc-500">Default city (optional)</span>
                <input name="defaultCity" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-zinc-500">Default suburb (optional)</span>
                <input name="defaultSuburb" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-zinc-500">Default region</span>
                <input
                  name="defaultRegion"
                  defaultValue={metroConfig.regionDefault}
                  className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white"
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-zinc-500">Default source</span>
                <input
                  name="defaultSource"
                  defaultValue={`csv_${marketSlug}`}
                  className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white"
                />
              </label>
            </div>
            <label className="grid gap-1 text-xs">
              <span className="text-zinc-500">Default performance tags (comma)</span>
              <input name="defaultTags" placeholder="MUSIC,VARIETY" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <input
                name="csvFile"
                type="file"
                accept=".csv,text/csv"
                required
                className="text-sm text-zinc-300 file:mr-2 file:rounded file:border-0 file:bg-zinc-700 file:px-2 file:py-1 file:text-white"
              />
              <button
                type="submit"
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              >
                Import
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-lg font-medium text-white">Next metro</h2>
          <p className="mt-2 text-xs text-zinc-500">
            Preload metros in{" "}
            <Link className="text-emerald-400 hover:text-emerald-300" href="/internal/admin/growth/expansion">
              Launch markets &amp; expansion
            </Link>{" "}
            (queued rows + optional auto-activation). Still add matching entries in{" "}
            <code className="text-zinc-400">marketsConfig.ts</code> for UI shortcuts and set{" "}
            <code className="text-zinc-400">DEFAULT_GROWTH_METRO_ID</code> when changing the default hub focus.
          </p>
        </div>
      </section>

      <section className="mt-10 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-lg font-medium text-white">Create lead manually</h2>
        <form action={createGrowthLeadAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Name</span>
            <input name="name" required className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Lead type</span>
            <select name="leadType" required className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white">
              <option value="VENUE">VENUE</option>
              <option value="ARTIST">ARTIST</option>
              <option value="PROMOTER_ACCOUNT">PROMOTER_ACCOUNT</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Contact email</span>
            <input name="contactEmail" type="email" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Contact URL</span>
            <input name="contactUrl" type="url" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Website</span>
            <input name="websiteUrl" type="url" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Instagram URL</span>
            <input name="instagramUrl" type="url" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">YouTube URL</span>
            <input name="youtubeUrl" type="url" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">TikTok URL</span>
            <input name="tiktokUrl" type="url" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Suburb</span>
            <input name="suburb" placeholder="Evanston, Oak Park, …" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">City</span>
            <input name="city" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Region</span>
            <input
              name="region"
              defaultValue={metroConfig.regionDefault}
              className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Discovery market slug</span>
            <input
              name="discoveryMarketSlug"
              defaultValue={marketSlug}
              className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-xs text-white"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Source</span>
            <input name="source" defaultValue="manual" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Fit score (optional)</span>
            <input name="fitScore" type="number" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-zinc-400">Tags (comma: MUSIC, COMEDY, POETRY, VARIETY)</span>
            <input name="tags" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-zinc-400">Internal notes</span>
            <textarea name="internalNotes" rows={2} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-md bg-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-600">
              Create lead
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

function FunnelStat({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded border px-3 py-2 ${
        highlight
          ? "border-emerald-600/40 bg-emerald-950/25"
          : warn
            ? "border-amber-700/40 bg-amber-950/20"
            : "border-zinc-800 bg-black/20"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
