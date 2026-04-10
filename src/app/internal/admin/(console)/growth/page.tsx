import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { createGrowthLeadAction, importGrowthLeadsCsvAction } from "@/app/internal/admin/growthActions";
import { ClaudeGrowthCsvImportPanel } from "./_components/ClaudeGrowthCsvImportPanel";
import { loadGrowthDailyActivityStats } from "@/lib/growth/growthDailyActivity";
import { loadGrowthFunnelMetrics, loadGrowthMarketMetrics } from "@/lib/growth/marketMetrics";
import { growthDiscoveryAllocationSummary } from "@/lib/growth/growthDiscoveryAllocation";
import { listGrowthDiscoveryAdapterRegistry } from "@/lib/growth/discoveryAdapterCatalog";
import {
  growthSerpApiCostPerCallUsd,
  growthSerpApiDailyMax,
  growthSerpApiEnabled,
  growthSerpApiMonthlySoftMax,
} from "@/lib/growth/discovery/autonomousConfig";
import { readSerpApiMetricsForMarket } from "@/lib/growth/discovery/webSearch";
import {
  defaultGrowthMetro,
  GROWTH_METROS,
  nationalDiscoveryMarketSlug,
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
    claudeBatch?: string;
    claudeFile?: string;
    claudeRows?: string;
    claudeInserted?: string;
    claudeUpdated?: string;
    claudeDup?: string;
    claudeSkipped?: string;
    claudeParseErrs?: string;
    claudePrimaryEmailRows?: string;
    claudeAdditionalEmailRows?: string;
    claudeContactPageOnlyRows?: string;
    claudeVenueRows?: string;
    claudeArtistRows?: string;
    claudePromoterRows?: string;
    claudeVenueAutoEligible?: string;
  }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();

  const marketSlug = resolveGrowthMarketSlug({ market: params.market, metro: params.metro });
  const metroConfig =
    GROWTH_METROS.find((m) => m.discoveryMarketSlug.toLowerCase() === marketSlug.toLowerCase()) ?? defaultGrowthMetro();

  const marketEq = { discoveryMarketSlug: { equals: marketSlug, mode: "insensitive" as const } };

  const [
    metrics,
    funnel,
    overallFunnel,
    daily,
    byType,
    total,
    launchRows,
    venueSignalBreakdown,
    venueAcqBreakdown,
    venueContactBreakdown,
    autoVenueDrafted,
    autoVenueSent,
    pendingVenuePathTasks,
    storedVenueContacts,
    leadSourceBreakdown,
    draftSourceBreakdown,
    sentSourceBreakdown,
    leadSourceFitBreakdown,
    leadSourceWithEmailBreakdown,
    leadSourceWithoutEmailBreakdown,
    draftErrorRows,
    emailRejectionReasonBreakdown,
    lowConfidenceEmailCount,
    invalidEmailDroppedCount,
  ] =
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
      prisma.growthLead.groupBy({
        by: ["contactQuality"],
        where: { ...marketEq, leadType: "VENUE" },
        _count: { _all: true },
      }),
      prisma.growthLeadOutreachDraft.count({
        where: {
          lead: { leadType: "VENUE", discoveryMarketSlug: { equals: marketSlug, mode: "insensitive" } },
          approvedByEmail: "auto-venue-priority",
        },
      }),
      prisma.growthLeadOutreachDraft.count({
        where: {
          lead: { leadType: "VENUE", discoveryMarketSlug: { equals: marketSlug, mode: "insensitive" } },
          approvedByEmail: "auto-venue-priority",
          status: "SENT",
        },
      }),
      prisma.marketingJob.count({
        where: {
          kind: "SOCIAL_PAYLOAD_RENDER",
          status: "PENDING",
          discoveryMarketSlug: { equals: marketSlug, mode: "insensitive" },
        },
      }),
      prisma.marketingContact.count({
        where: {
          discoveryMarketSlug: { equals: marketSlug, mode: "insensitive" },
          source: { contains: "growth-lead", mode: "insensitive" },
        },
      }),
      prisma.growthLead.groupBy({
        by: ["source"],
        where: marketEq,
        _count: { _all: true },
      }),
      prisma.growthLeadOutreachDraft.findMany({
        where: { lead: marketEq },
        select: { status: true, lead: { select: { source: true } } },
      }),
      prisma.growthLeadOutreachDraft.findMany({
        where: { status: "SENT", lead: marketEq },
        select: { lead: { select: { source: true } } },
      }),
      prisma.growthLead.groupBy({
        by: ["source"],
        where: marketEq,
        _avg: { fitScore: true },
      }),
      prisma.growthLead.groupBy({
        by: ["source"],
        where: { ...marketEq, contactEmailNormalized: { not: null } },
        _count: { _all: true },
      }),
      prisma.growthLead.groupBy({
        by: ["source"],
        where: { ...marketEq, contactEmailNormalized: null },
        _count: { _all: true },
      }),
      prisma.growthLeadOutreachDraft.findMany({
        where: { lead: marketEq, lastError: { not: null } },
        select: { lastError: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
      prisma.growthLead.groupBy({
        by: ["contactEmailRejectionReason"],
        where: { ...marketEq, contactEmailRejectionReason: { not: null } },
        _count: { _all: true },
      }),
      prisma.growthLead.count({
        where: { ...marketEq, contactEmailConfidence: "LOW" },
      }),
      prisma.growthLead.count({
        where: { ...marketEq, contactEmailRejectionReason: { not: null } },
      }),
    ]);

  const autoWebVenueBase = {
    leadType: "VENUE" as const,
    source: { contains: "autonomous_web_search_venue", mode: "insensitive" as const },
  };

  const [
    serpMetrics,
    serpMetricsNational,
    autoWebVenueTotal,
    autoWebVenueNationalBucket,
    autoWebVenueStateRollups,
    autoWebVenueWithEmail,
    autoWebVenueMultiEmail,
    autoWebVenueContactPageNoEmail,
    autoWebVenueSocialPathNoEmail,
    autoWebSrcMailto,
    autoWebSrcHeaderFooter,
    autoWebSrcSecondaryPage,
    autoWebSrcBody,
  ] = await Promise.all([
    readSerpApiMetricsForMarket(prisma, marketSlug),
    readSerpApiMetricsForMarket(prisma, nationalDiscoveryMarketSlug()),
    prisma.growthLead.count({ where: autoWebVenueBase }),
    prisma.growthLead.count({
      where: {
        ...autoWebVenueBase,
        discoveryMarketSlug: { equals: nationalDiscoveryMarketSlug(), mode: "insensitive" },
      },
    }),
    prisma.growthLead.count({
      where: {
        ...autoWebVenueBase,
        discoveryMarketSlug: { startsWith: "open-mics-", mode: "insensitive" },
      },
    }),
    prisma.growthLead.count({
      where: { ...autoWebVenueBase, contactEmailNormalized: { not: null } },
    }),
    prisma.growthLead.count({
      where: { ...autoWebVenueBase, internalNotes: { contains: "multi=true" } },
    }),
    prisma.growthLead.count({
      where: {
        ...autoWebVenueBase,
        contactEmailNormalized: null,
        contactQuality: "CONTACT_PAGE",
      },
    }),
    prisma.growthLead.count({
      where: {
        ...autoWebVenueBase,
        contactEmailNormalized: null,
        contactQuality: "SOCIAL_OR_CALENDAR",
      },
    }),
    prisma.growthLead.count({
      where: { ...autoWebVenueBase, internalNotes: { contains: "primary_src=mailto" } },
    }),
    prisma.growthLead.count({
      where: { ...autoWebVenueBase, internalNotes: { contains: "primary_src=header_footer" } },
    }),
    prisma.growthLead.count({
      where: { ...autoWebVenueBase, internalNotes: { contains: "primary_src=secondary_page" } },
    }),
    prisma.growthLead.count({
      where: { ...autoWebVenueBase, internalNotes: { contains: "primary_src=body" } },
    }),
  ]);
  const draftBySource: Record<string, number> = {};
  for (const row of draftSourceBreakdown) {
    const k = row.lead.source || "unknown";
    draftBySource[k] = (draftBySource[k] ?? 0) + 1;
  }
  const sentBySource: Record<string, number> = {};
  for (const row of sentSourceBreakdown) {
    const k = row.lead.source || "unknown";
    sentBySource[k] = (sentBySource[k] ?? 0) + 1;
  }
  const avgFitBySource: Record<string, number> = {};
  for (const row of leadSourceFitBreakdown) {
    avgFitBySource[row.source || "unknown"] = Number((row._avg.fitScore ?? 0).toFixed(2));
  }
  const withEmailBySource: Record<string, number> = {};
  for (const row of leadSourceWithEmailBreakdown) {
    withEmailBySource[row.source || "unknown"] = row._count._all;
  }
  const withoutEmailBySource: Record<string, number> = {};
  for (const row of leadSourceWithoutEmailBreakdown) {
    withoutEmailBySource[row.source || "unknown"] = row._count._all;
  }
  const rejectionReasonsByCount: Record<string, number> = {};
  for (const row of draftErrorRows) {
    const raw = (row.lastError || "").trim();
    if (!raw) continue;
    const reason = raw
      .split("|")[0]!
      .replace(/\s+/g, " ")
      .slice(0, 180);
    rejectionReasonsByCount[reason] = (rejectionReasonsByCount[reason] ?? 0) + 1;
  }
  const topRejectionReasons = Object.entries(rejectionReasonsByCount).sort((a, b) => b[1] - a[1]).slice(0, 12);

  const emailRejectCounts: Record<string, number> = {};
  for (const row of emailRejectionReasonBreakdown) {
    const k = (row.contactEmailRejectionReason ?? "unknown").slice(0, 120);
    emailRejectCounts[k] = row._count._all;
  }
  const topEmailRejectReasons = Object.entries(emailRejectCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);

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
        manual, CSV, and optional scheduled discovery jobs (adapters). Top venue leads in ACTIVE launch markets now
        auto-advance through draft → approval → send under existing send protections. Artists/promoters stay manual-first.
        Follow-up automation:{" "}
        <span className="text-zinc-300">{growthFollowUpAutomationEnabled() ? "ON" : "OFF"}</span> (default off).
      </p>
      <p className="mt-2 max-w-2xl text-xs text-zinc-500">
        Cron: <code className="text-zinc-400">POST /api/cron/growth-pipeline</code> with{" "}
        <code className="text-zinc-400">GROWTH_LEAD_DISCOVERY_CRON_ENABLED</code> /{" "}
        <code className="text-zinc-400">GROWTH_AUTO_DRAFT_CRON_ENABLED</code>. Primary launch slug{" "}
        <code className="text-zinc-400">{primaryLaunchDiscoveryMarketSlug()}</code> from{" "}
        <code className="text-zinc-400">marketsConfig</code> (override list:{" "}
        <code className="text-zinc-400">GROWTH_DISCOVERY_MARKET_SLUGS</code>; default includes{" "}
        <code className="text-zinc-400">{nationalDiscoveryMarketSlug()}</code> for nationwide Serp/CSE venue search). Caps:
        outreach{" "}
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
        <h2 className="text-sm font-medium text-white">Lead email hygiene (this market)</h2>
        <p className="mt-1 text-xs text-zinc-400">
          LOW confidence (no auto-draft/auto-send): <span className="text-zinc-200">{lowConfidenceEmailCount}</span>
          {" · "}
          Invalid dropped (rejected scrape / unusable): <span className="text-zinc-200">{invalidEmailDroppedCount}</span>
        </p>
        {topEmailRejectReasons.length ? (
          <div className="mt-2">
            <p className="text-xs font-medium text-zinc-300">Rejected email reasons (counts)</p>
            <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto font-mono text-[11px] text-zinc-400">
              {topEmailRejectReasons.map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">No rejected-email audit rows in this market yet.</p>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-medium text-white">Autonomous discovery (venue-only web search) &amp; funnel</h2>
        <p className="mt-1 text-xs text-zinc-500">{growthDiscoveryAllocationSummary()}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Cron JSON includes <code className="text-zinc-400">discoveryAllocationSummary</code> and{" "}
          <code className="text-zinc-400">effectiveCapsByAdapter</code> per run.
        </p>
        <div className="mt-4 rounded border border-sky-800/60 bg-sky-950/25 px-3 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-200/95">
            Nationwide autonomous venue web search (global)
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-sky-100/80">
            Source <code className="text-sky-200/90">autonomous_web_search_venue*</code>. Leads are tagged with{" "}
            <code className="text-sky-200/90">national-discovery-us</code> until geo is inferred, or{" "}
            <code className="text-sky-200/90">open-mics-**</code> when a state is parsed. Sends still require an ACTIVE
            launch market for that slug; the national bucket is an expansion queue.
          </p>
          <ul className="mt-2 grid gap-1 font-mono text-[11px] text-sky-100/85 sm:grid-cols-2">
            <li>Total venue leads (this source): {autoWebVenueTotal}</li>
            <li>Still in national queue ({nationalDiscoveryMarketSlug()}): {autoWebVenueNationalBucket}</li>
            <li>Assigned to state rollups (open-mics-*): {autoWebVenueStateRollups}</li>
            <li>With primary email on lead: {autoWebVenueWithEmail}</li>
            <li>Multiple emails found (multi=true): {autoWebVenueMultiEmail}</li>
            <li>No email · contact-style URL only: {autoWebVenueContactPageNoEmail}</li>
            <li>No email · social/contact path: {autoWebVenueSocialPathNoEmail}</li>
            <li className="sm:col-span-2">
              Best primary source (highest-scoring mailbox): mailto {autoWebSrcMailto} · header/footer{" "}
              {autoWebSrcHeaderFooter} · secondary page {autoWebSrcSecondaryPage} · body {autoWebSrcBody}
            </li>
            <li className="sm:col-span-2">
              SerpAPI usage (national lane): calls today {serpMetricsNational.callsToday} · month{" "}
              {serpMetricsNational.callsMonth} · disabled_until {serpMetricsNational.disabledUntil ?? "—"}
            </li>
          </ul>
        </div>
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
          <div>
            <p className="font-medium text-zinc-300">Venue contact quality</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
              {venueContactBreakdown.map((row) => (
                <li key={String(row.contactQuality)}>
                  {(row.contactQuality ?? "null") + ": " + row._count._all}
                </li>
              ))}
              {venueContactBreakdown.length === 0 ? <li>—</li> : null}
            </ul>
          </div>
          <div>
            <p className="font-medium text-zinc-300">Venue automation</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
              <li>auto drafted/approved: {autoVenueDrafted}</li>
              <li>auto sent: {autoVenueSent}</li>
              <li>non-email path tasks pending: {pendingVenuePathTasks}</li>
              <li>stored reusable venue contacts: {storedVenueContacts}</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-medium text-white">Discovery source &amp; SerpAPI quota metrics</h2>
        <p className="mt-1 text-xs text-zinc-500">
          SerpAPI premium mode: {growthSerpApiEnabled() ? "enabled" : "disabled"} · daily max {growthSerpApiDailyMax()} ·
          monthly soft max {growthSerpApiMonthlySoftMax()} · cost/call $
          {growthSerpApiCostPerCallUsd().toFixed(4)}.
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          serpapi_calls_today {serpMetrics.callsToday} · serpapi_calls_month {serpMetrics.callsMonth} ·
          serpapi_disabled_until {serpMetrics.disabledUntil ?? "null"} · serpapi_last_429_at{" "}
          {serpMetrics.last429At ?? "null"}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs text-zinc-400">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-2">Source</th>
                <th className="py-2 pr-2">Candidates</th>
                <th className="py-2 pr-2">Leads w/ Email</th>
                <th className="py-2 pr-2">Leads w/o Email</th>
                <th className="py-2 pr-2">Avg Fit</th>
                <th className="py-2 pr-2">Drafts</th>
                <th className="py-2 pr-2">Sent</th>
                <th className="py-2 pr-2">Cost/Candidate USD</th>
              </tr>
            </thead>
            <tbody>
              {leadSourceBreakdown.map((row) => {
                const src = row.source || "unknown";
                const candidates = row._count._all;
                const costPerCandidate =
                  src === "autonomous_web_search_venue"
                    ? Number(
                        (
                          (serpMetrics.callsToday * growthSerpApiCostPerCallUsd()) /
                          Math.max(1, candidates)
                        ).toFixed(4),
                      )
                    : 0;
                return (
                  <tr key={src} className="border-b border-zinc-800/70">
                    <td className="py-2 pr-2 font-mono text-[11px] text-zinc-300">{src}</td>
                    <td className="py-2 pr-2">{candidates}</td>
                    <td className="py-2 pr-2">{withEmailBySource[src] ?? 0}</td>
                    <td className="py-2 pr-2">{withoutEmailBySource[src] ?? 0}</td>
                    <td className="py-2 pr-2">{(avgFitBySource[src] ?? 0).toFixed(2)}</td>
                    <td className="py-2 pr-2">{draftBySource[src] ?? 0}</td>
                    <td className="py-2 pr-2">{sentBySource[src] ?? 0}</td>
                    <td className="py-2 pr-2">{costPerCandidate.toFixed(4)}</td>
                  </tr>
                );
              })}
              {leadSourceBreakdown.length === 0 ? (
                <tr>
                  <td className="py-2 pr-2 text-zinc-500" colSpan={8}>
                    No source rows yet for this market.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-300">rejection_reasons_by_count (from latest draft lastError rows)</p>
          <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-zinc-400">
            {topRejectionReasons.map(([reason, count]) => (
              <li key={reason}>
                {count} · {reason}
              </li>
            ))}
            {topRejectionReasons.length === 0 ? <li>—</li> : null}
          </ul>
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
      {params.claudeRows !== undefined ? (
        <div className="mt-3 rounded border border-teal-700/40 bg-teal-950/25 px-3 py-2 text-sm text-teal-50">
          <p className="font-medium text-teal-100">Claude CSV import summary</p>
          <p className="mt-1 text-xs text-teal-200/90">
            Batch <span className="font-mono text-teal-100">{params.claudeBatch}</span>
            {params.claudeFile ? (
              <>
                {" "}
                · file <span className="font-mono text-teal-100">{params.claudeFile}</span>
              </>
            ) : null}
          </p>
          <ul className="mt-2 grid gap-1 text-xs text-teal-100/95 sm:grid-cols-2">
            <li>Rows in file: {params.claudeRows}</li>
            <li>New leads created: {params.claudeInserted}</li>
            <li>Existing leads updated (merged fields): {params.claudeUpdated}</li>
            <li>Duplicates (no field changes): {params.claudeDup}</li>
            <li>Skipped / failed rows: {params.claudeSkipped}</li>
            <li>CSV parse errors: {params.claudeParseErrs}</li>
            <li>Rows with primary email (valid): {params.claudePrimaryEmailRows}</li>
            <li>Rows with ≥1 additional email (valid): {params.claudeAdditionalEmailRows}</li>
            <li>Rows with paths only (no valid email): {params.claudeContactPageOnlyRows}</li>
            <li>VENUE / ARTIST / PROMOTER rows: {params.claudeVenueRows} / {params.claudeArtistRows} /{" "}
              {params.claudePromoterRows}</li>
            <li className="sm:col-span-2">
              Distinct venue leads matching auto-draft heuristic in an ACTIVE launch market:{" "}
              <span className="font-semibold text-teal-50">{params.claudeVenueAutoEligible}</span> (next cron run can
              draft/send under existing caps)
            </li>
          </ul>
        </div>
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
        <div className="rounded-lg border border-teal-900/50 bg-zinc-900/40 p-4">
          <h2 className="text-lg font-medium text-white">Import Claude CSV (full column set)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Upload a Claude-generated spreadsheet. Preview runs in the browser; import runs on the server with batch
            metadata in internal notes. Same dedupe, MarketingContact sidecar, and venue path jobs as the rest of growth.
          </p>
          <ClaudeGrowthCsvImportPanel />
        </div>

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
            <input
              name="contactEmail"
              type="text"
              autoComplete="off"
              placeholder="venue@domain.com"
              className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
            <input type="checkbox" name="allowPlaceholderEmail" className="rounded border-zinc-600" />
            Allow placeholder/test addresses (manual QA only; e.g. example.com)
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
