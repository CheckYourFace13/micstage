import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import {
  createGrowthLeadAction,
  importGrowthLeadsCsvAction,
} from "@/app/internal/admin/growthActions";
import { growthFollowUpAutomationEnabled } from "@/lib/marketing/emailConfig";
import { loadGrowthMarketMetrics } from "@/lib/growth/marketMetrics";
import { defaultGrowthMetro, GROWTH_METROS, resolveGrowthMarketSlug } from "@/lib/growth/marketsConfig";
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
    parseErrs?: string;
  }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();

  const marketSlug = resolveGrowthMarketSlug({ market: params.market, metro: params.metro });
  const metroConfig =
    GROWTH_METROS.find((m) => m.discoveryMarketSlug.toLowerCase() === marketSlug.toLowerCase()) ?? defaultGrowthMetro();

  const [metrics, byType, total] = await Promise.all([
    loadGrowthMarketMetrics(prisma, marketSlug),
    prisma.growthLead.groupBy({
      by: ["leadType"],
      where: { discoveryMarketSlug: { equals: marketSlug, mode: "insensitive" } },
      _count: { _all: true },
    }),
    prisma.growthLead.count({
      where: { discoveryMarketSlug: { equals: marketSlug, mode: "insensitive" } },
    }),
  ]);

  const counts = Object.fromEntries(byType.map((g) => [g.leadType, g._count._all])) as Record<string, number>;
  const chiSlug = defaultGrowthMetro().discoveryMarketSlug;

  return (
    <main className="mx-auto max-w-5xl px-3 py-6">
      <h1 className="text-xl font-semibold text-white">Growth &amp; outbound</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-400">
        Market-by-market launch. Default is <strong className="text-zinc-200">{defaultGrowthMetro().label}</strong>. Manual
        and CSV leads only — no auto-scrape. Cold outreach stays <span className="text-zinc-300">draft → approve → send</span>{" "}
        with existing marketing caps. Follow-up automation:{" "}
        <span className="text-zinc-300">{growthFollowUpAutomationEnabled() ? "ON" : "OFF"}</span>.
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

      {params.err ? (
        <p className="mt-3 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {params.err}
        </p>
      ) : null}
      {params.ok ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          Saved ({params.ok}).
        </p>
      ) : null}
      {params.importInserted !== undefined ? (
        <p className="mt-3 rounded border border-zinc-600/40 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
          CSV import: inserted {params.importInserted}, failed creates {params.importFailed ?? "0"}, parse errors{" "}
          {params.parseErrs ?? "0"}. Check server logs for row details if failures &gt; 0.
        </p>
      ) : null}

      <section className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-lg font-medium text-white">Pipeline funnel (this market)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Discovered / in review = DISCOVERED + REVIEWED. Replied = lead status. Reply logs = EMAIL responses logged. Sends =
          growth outreach drafts marked SENT (this market).
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <FunnelStat label="Discovered / in review" value={metrics.funnel.discoveredOrReview} />
          <FunnelStat label="Approved" value={metrics.funnel.approved} />
          <FunnelStat label="Contacted" value={metrics.funnel.contacted} />
          <FunnelStat label="Replied (status)" value={metrics.funnel.replied} />
          <FunnelStat label="Joined" value={metrics.funnel.joined} highlight />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <FunnelStat label="Sends (drafts)" value={metrics.outreach.sends} />
          <FunnelStat label="Reply logs (EMAIL)" value={metrics.replyLogsEmail} />
          <FunnelStat label="Bounced" value={metrics.outcomes.bounced} warn />
          <FunnelStat label="Unsubscribed" value={metrics.outcomes.unsubscribed} warn />
        </div>
        <p className="mt-2 text-xs text-zinc-600">Rejected in market: {metrics.outcomes.rejected}</p>
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
