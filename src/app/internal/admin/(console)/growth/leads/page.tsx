import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import {
  GROWTH_LEADS_PAGE_SIZE_DEFAULT,
  GrowthLeadsFilteredTable,
} from "@/app/internal/admin/(console)/growth/_components/GrowthLeadsFilteredTable";
import type {
  GrowthLeadAcquisitionStage,
  GrowthLeadContactQuality,
  GrowthLeadOpenMicSignalTier,
  GrowthLeadPerformanceTag,
  GrowthLeadStatus,
  GrowthLeadType,
} from "@/generated/prisma/client";
import { buildGrowthLeadWhere } from "@/lib/growth/growthLeadFilters";
import type { GrowthLeadListFilters, GrowthLeadOutreachQueue } from "@/lib/growth/growthLeadFilters";
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

function parseOpenMicTier(raw: string | undefined): GrowthLeadOpenMicSignalTier | null {
  if (!raw?.trim()) return null;
  const u = raw.trim();
  if (u === "EXPLICIT_OPEN_MIC" || u === "STRONG_LIVE_EVENT" || u === "WEAK_INFERRED") return u;
  return null;
}

function parseContactQuality(raw: string | undefined): GrowthLeadContactQuality | null {
  if (!raw?.trim()) return null;
  const u = raw.trim();
  if (u === "EMAIL" || u === "CONTACT_PAGE" || u === "SOCIAL_OR_CALENDAR" || u === "WEBSITE_ONLY") return u;
  return null;
}

function parseAcquisitionStage(raw: string | undefined): GrowthLeadAcquisitionStage | null {
  if (!raw?.trim()) return null;
  const u = raw.trim();
  const allowed: GrowthLeadAcquisitionStage[] = [
    "DISCOVERED",
    "OUTREACH_DRAFTED",
    "OUTREACH_SENT",
    "CLICKED",
    "SIGNUP_STARTED",
    "ACCOUNT_CREATED",
    "LISTING_LIVE",
  ];
  return allowed.includes(u as GrowthLeadAcquisitionStage) ? (u as GrowthLeadAcquisitionStage) : null;
}

function parseOutreachQueue(raw: string | undefined): GrowthLeadOutreachQueue {
  if (!raw?.trim()) return "all";
  const u = raw.trim();
  const allowed: GrowthLeadOutreachQueue[] = [
    "all",
    "email_pipeline",
    "email_outreach_ready",
    "contact_path_queue",
    "social_path_queue",
    "website_only_queue",
  ];
  return allowed.includes(u as GrowthLeadOutreachQueue) ? (u as GrowthLeadOutreachQueue) : "all";
}

function parseLeadsPage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function parseLeadsPageSize(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return GROWTH_LEADS_PAGE_SIZE_DEFAULT;
  return Math.min(100, Math.max(10, n));
}

function buildGrowthLeadsPaginationBaseQuery(p: {
  market?: string;
  type?: string;
  city?: string;
  suburb?: string;
  tags?: string;
  status?: string;
  fitMin?: string;
  fitMax?: string;
  q?: string;
  pipeline?: string;
  draftPending?: string;
  omTier?: string;
  contactQ?: string;
  acquisition?: string;
  queue?: string;
  perPage?: string;
}): Record<string, string | undefined> {
  const o: Record<string, string | undefined> = {};
  const set = (k: string, v: string | undefined) => {
    if (v != null && v !== "") o[k] = v;
  };
  set("market", p.market?.trim());
  set("type", p.type?.trim());
  set("city", p.city?.trim());
  set("suburb", p.suburb?.trim());
  set("tags", p.tags?.trim());
  set("status", p.status?.trim());
  set("fitMin", p.fitMin?.trim());
  set("fitMax", p.fitMax?.trim());
  set("q", p.q?.trim());
  set("omTier", p.omTier?.trim());
  set("contactQ", p.contactQ?.trim());
  set("acquisition", p.acquisition?.trim());
  if (p.pipeline === "1") o.pipeline = "1";
  if (p.draftPending === "1") o.draftPending = "1";
  const queue = parseOutreachQueue(p.queue);
  if (queue !== "all") o.queue = queue;
  const ps = parseLeadsPageSize(p.perPage);
  if (ps !== GROWTH_LEADS_PAGE_SIZE_DEFAULT) o.perPage = String(ps);
  return o;
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
    draftPending?: string;
    omTier?: string;
    contactQ?: string;
    acquisition?: string;
    queue?: string;
    page?: string;
    perPage?: string;
  }>;
}) {
  await assertAdminSession();
  const p = await props.searchParams;
  const prisma = requirePrisma();

  const marketSlug = resolveGrowthMarketSlug({ market: p.market, metro: p.metro });
  const outreachQueue = parseOutreachQueue(p.queue);
  const pageSize = parseLeadsPageSize(p.perPage);
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
    draftPending: p.draftPending === "1",
    openMicSignalTier: parseOpenMicTier(p.omTier),
    contactQuality: parseContactQuality(p.contactQ),
    acquisitionStage: parseAcquisitionStage(p.acquisition),
    outreachQueue,
  };

  const where = buildGrowthLeadWhere(filters);
  const matchCount = await prisma.growthLead.count({ where });
  const page = parseLeadsPage(p.page);
  const totalPages = Math.max(1, Math.ceil(matchCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginationBase = buildGrowthLeadsPaginationBaseQuery({
    ...p,
    market: marketSlug,
    queue: outreachQueue === "all" ? undefined : outreachQueue,
    perPage: pageSize === GROWTH_LEADS_PAGE_SIZE_DEFAULT ? undefined : String(pageSize),
  });

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
        {matchCount === 1 ? "" : "s"} match current filters (paginated; no fixed row cap).
      </p>

      <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-medium text-white">Outreach queues</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Primary pipeline = mailable email (HIGH/MEDIUM). Secondary queues keep contact URLs and socials for manual follow-up
          or future automation. Email-ready filter adds status + discovery-confidence gates; marketing suppression still applies at
          send time (see lead detail block preview).
        </p>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          <li>
            <Link
              className="text-emerald-400 hover:text-emerald-300"
              href={`/internal/admin/growth/leads?${new URLSearchParams({
                market: marketSlug,
                queue: "email_pipeline",
                ...(p.type ? { type: p.type } : {}),
              }).toString()}`}
            >
              Email pipeline
            </Link>
          </li>
          <li>
            <Link
              className="text-emerald-400 hover:text-emerald-300"
              href={`/internal/admin/growth/leads?${new URLSearchParams({
                market: marketSlug,
                queue: "email_outreach_ready",
                ...(p.type ? { type: p.type } : {}),
              }).toString()}`}
            >
              Email outreach-ready
            </Link>
          </li>
          <li>
            <Link
              className="text-sky-400 hover:text-sky-300"
              href={`/internal/admin/growth/leads?${new URLSearchParams({
                market: marketSlug,
                queue: "contact_path_queue",
                ...(p.type ? { type: p.type } : {}),
              }).toString()}`}
            >
              Contact-path queue
            </Link>
          </li>
          <li>
            <Link
              className="text-violet-400 hover:text-violet-300"
              href={`/internal/admin/growth/leads?${new URLSearchParams({
                market: marketSlug,
                queue: "social_path_queue",
                ...(p.type ? { type: p.type } : {}),
              }).toString()}`}
            >
              Social / calendar queue
            </Link>
          </li>
          <li>
            <Link className="text-zinc-400 hover:text-zinc-200" href={`/internal/admin/growth/leads?market=${encodeURIComponent(marketSlug)}`}>
              All leads (email-first sort)
            </Link>
          </li>
        </ul>
      </section>

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
              href={`/internal/admin/growth/leads?market=${encodeURIComponent(defaultGrowthMetro().discoveryMarketSlug)}&type=VENUE&pipeline=1&queue=email_outreach_ready`}
            >
              Chicagoland venues — email outreach-ready
            </Link>
          </li>
          <li>
            <Link
              className="text-emerald-400 hover:text-emerald-300"
              href={`/internal/admin/growth/leads?market=${encodeURIComponent(defaultGrowthMetro().discoveryMarketSlug)}&type=VENUE&pipeline=1`}
            >
              Chicagoland venues (pipeline, all queues)
            </Link>
          </li>
          <li>
            <Link
              className="text-emerald-400 hover:text-emerald-300"
              href={`/internal/admin/growth/leads?market=${encodeURIComponent(defaultGrowthMetro().discoveryMarketSlug)}&type=VENUE&omTier=EXPLICIT_OPEN_MIC`}
            >
              Venues — explicit open-mic signal
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
            <span className="text-xs text-zinc-500">Outreach queue (primary vs secondary)</span>
            <select
              name="queue"
              defaultValue={outreachQueue}
              className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white"
            >
              <option value="all">All — email / contact quality sorted</option>
              <option value="email_pipeline">Email pipeline (HIGH/MEDIUM email)</option>
              <option value="email_outreach_ready">Email outreach-ready (+ status / disc. conf.)</option>
              <option value="contact_path_queue">Secondary — contact-path queue</option>
              <option value="social_path_queue">Secondary — social / calendar queue</option>
              <option value="website_only_queue">Secondary — website only</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Rows per page</span>
            <select
              name="perPage"
              defaultValue={String(pageSize)}
              className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white"
            >
              {[25, 50, 75, 100].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
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
            <span className="text-xs text-zinc-500">Has pending-review draft</span>
            <select name="draftPending" defaultValue={p.draftPending === "1" ? "1" : ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white">
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
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Open-mic signal tier</span>
            <select name="omTier" defaultValue={p.omTier ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white">
              <option value="">Any</option>
              <option value="EXPLICIT_OPEN_MIC">EXPLICIT_OPEN_MIC</option>
              <option value="STRONG_LIVE_EVENT">STRONG_LIVE_EVENT</option>
              <option value="WEAK_INFERRED">WEAK_INFERRED</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Contact quality</span>
            <select name="contactQ" defaultValue={p.contactQ ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white">
              <option value="">Any</option>
              <option value="EMAIL">EMAIL</option>
              <option value="CONTACT_PAGE">CONTACT_PAGE</option>
              <option value="SOCIAL_OR_CALENDAR">SOCIAL_OR_CALENDAR</option>
              <option value="WEBSITE_ONLY">WEBSITE_ONLY</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Acquisition stage</span>
            <select name="acquisition" defaultValue={p.acquisition ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white">
              <option value="">Any</option>
              <option value="DISCOVERED">DISCOVERED</option>
              <option value="OUTREACH_DRAFTED">OUTREACH_DRAFTED</option>
              <option value="OUTREACH_SENT">OUTREACH_SENT</option>
              <option value="CLICKED">CLICKED</option>
              <option value="SIGNUP_STARTED">SIGNUP_STARTED</option>
              <option value="ACCOUNT_CREATED">ACCOUNT_CREATED</option>
              <option value="LISTING_LIVE">LISTING_LIVE</option>
            </select>
          </label>
        </div>
        <button type="submit" className="rounded-md bg-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-600">
          Apply filters
        </button>
      </form>

      <GrowthLeadsFilteredTable
        filters={filters}
        title={metro ? `${metro.label} — filtered leads` : `${marketSlug} — filtered leads`}
        totalCount={matchCount}
        page={safePage}
        pageSize={pageSize}
        baseQuery={paginationBase}
      />
    </main>
  );
}
