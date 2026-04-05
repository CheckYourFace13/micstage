import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { GrowthLeadsFilteredTable } from "@/app/internal/admin/(console)/growth/_components/GrowthLeadsFilteredTable";
import type { GrowthLeadPerformanceTag, GrowthLeadStatus, GrowthLeadType } from "@/generated/prisma/client";
import { buildGrowthLeadWhere } from "@/lib/growth/growthLeadFilters";
import type { GrowthLeadListFilters } from "@/lib/growth/growthLeadFilters";
import { GROWTH_LEAD_STATUS_SET } from "@/lib/growth/growthLeadStatusSet";
import { defaultGrowthMetro, GROWTH_METROS, resolveGrowthMarketSlug } from "@/lib/growth/marketsConfig";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseLeadType(raw: string | undefined): GrowthLeadType | null {
  if (!raw?.trim()) return null;
  const u = raw.trim().toUpperCase();
  if (u === "VENUE" || u === "ARTIST" || u === "PROMOTER_ACCOUNT") return u;
  return null;
}

function parseTagsParam(raw: string | undefined): GrowthLeadPerformanceTag[] {
  if (!raw?.trim()) return [];
  const out: GrowthLeadPerformanceTag[] = [];
  for (const part of raw.split(",")) {
    const u = part.trim().toUpperCase();
    if (u === "MUSIC") out.push("MUSIC");
    if (u === "COMEDY") out.push("COMEDY");
    if (u === "POETRY") out.push("POETRY");
    if (u === "VARIETY") out.push("VARIETY");
  }
  return [...new Set(out)];
}

function parseStatusesParam(raw: string | undefined): GrowthLeadStatus[] | null {
  if (!raw?.trim()) return null;
  const out: GrowthLeadStatus[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim() as GrowthLeadStatus;
    if (GROWTH_LEAD_STATUS_SET.has(t)) out.push(t);
  }
  return out.length ? out : null;
}

function parseIntOpt(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export default async function AdminGrowthLeadsPage(props: {
  searchParams: Promise<{
    market?: string;
    metro?: string;
    type?: string;
    city?: string;
    suburb?: string;
    tags?: string;
    status?: string;
    fitMin?: string;
    fitMax?: string;
    q?: string;
    pipeline?: string;
  }>;
}) {
  await assertAdminSession();
  const p = await props.searchParams;
  const prisma = requirePrisma();

  const marketSlug = resolveGrowthMarketSlug({ market: p.market, metro: p.metro });
  const filters: GrowthLeadListFilters = {
    marketSlug,
    leadType: parseLeadType(p.type),
    cityContains: p.city,
    suburbContains: p.suburb,
    tagsAny: parseTagsParam(p.tags),
    statuses: parseStatusesParam(p.status),
    fitMin: parseIntOpt(p.fitMin),
    fitMax: parseIntOpt(p.fitMax),
    nameContains: p.q,
    pipelineOnly: p.pipeline === "1",
  };

  const where = buildGrowthLeadWhere(filters);
  const matchCount = await prisma.growthLead.count({ where });

  const metro = GROWTH_METROS.find((m) => m.discoveryMarketSlug.toLowerCase() === marketSlug.toLowerCase());

  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-white">Growth leads</h1>
        <Link href="/internal/admin/growth" className="text-sm text-zinc-400 hover:text-white">
          ← Growth hub
        </Link>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Default market is <strong className="text-zinc-300">{defaultGrowthMetro().label}</strong> (
        <code className="text-zinc-400">{defaultGrowthMetro().discoveryMarketSlug}</code>). {matchCount} lead
        {matchCount === 1 ? "" : "s"} match current filters.
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {GROWTH_METROS.map((m) => (
          <Link
            key={m.id}
            href={`/internal/admin/growth/leads?market=${encodeURIComponent(m.discoveryMarketSlug)}`}
            className={`rounded border px-2 py-1 ${
              m.discoveryMarketSlug.toLowerCase() === marketSlug.toLowerCase()
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {m.label}
          </Link>
        ))}
      </div>

      <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-medium text-white">Saved views (Chicagoland)</h2>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          <li>
            <Link
              className="text-emerald-400 hover:text-emerald-300"
              href={`/internal/admin/growth/leads?market=${encodeURIComponent(defaultGrowthMetro().discoveryMarketSlug)}&type=VENUE&pipeline=1`}
            >
              Chicagoland venues (pipeline)
            </Link>
          </li>
          <li>
            <Link
              className="text-emerald-400 hover:text-emerald-300"
              href={`/internal/admin/growth/leads?market=${encodeURIComponent(defaultGrowthMetro().discoveryMarketSlug)}&type=ARTIST&pipeline=1`}
            >
              Chicagoland artists (pipeline)
            </Link>
          </li>
          <li>
            <Link
              className="text-emerald-400 hover:text-emerald-300"
              href={`/internal/admin/growth/leads?market=${encodeURIComponent(defaultGrowthMetro().discoveryMarketSlug)}&type=PROMOTER_ACCOUNT&pipeline=1`}
            >
              Chicagoland promoters (pipeline)
            </Link>
          </li>
        </ul>
      </section>

      <form method="get" className="mt-6 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Discovery market slug</span>
            <input
              name="market"
              defaultValue={marketSlug}
              className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-xs text-white"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Lead type</span>
            <select name="type" defaultValue={p.type ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white">
              <option value="">Any</option>
              <option value="VENUE">VENUE</option>
              <option value="ARTIST">ARTIST</option>
              <option value="PROMOTER_ACCOUNT">PROMOTER_ACCOUNT</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Pipeline only (discovered / reviewed / approved)</span>
            <select name="pipeline" defaultValue={p.pipeline === "1" ? "1" : ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white">
              <option value="">No</option>
              <option value="1">Yes</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">City contains</span>
            <input name="city" defaultValue={p.city ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Suburb contains</span>
            <input name="suburb" defaultValue={p.suburb ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Name contains</span>
            <input name="q" defaultValue={p.q ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Tags (comma: MUSIC, COMEDY, POETRY, VARIETY)</span>
            <input name="tags" defaultValue={p.tags ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Status (comma-separated)</span>
            <input
              name="status"
              defaultValue={p.status ?? ""}
              placeholder="DISCOVERED,APPROVED"
              className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-xs text-white"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Fit min</span>
            <input name="fitMin" type="number" defaultValue={p.fitMin ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Fit max</span>
            <input name="fitMax" type="number" defaultValue={p.fitMax ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
        </div>
        <button type="submit" className="rounded-md bg-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-600">
          Apply filters
        </button>
      </form>

      <GrowthLeadsFilteredTable
        filters={filters}
        title={metro ? `${metro.label} — filtered leads` : `${marketSlug} — filtered leads`}
      />
    </main>
  );
}
