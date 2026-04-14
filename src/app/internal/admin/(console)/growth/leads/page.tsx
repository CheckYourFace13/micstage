import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { GrowthLeadsFilteredTable } from "@/app/internal/admin/(console)/growth/_components/GrowthLeadsFilteredTable";
import { buildGrowthLeadWhere } from "@/lib/growth/growthLeadFilters";
import {
  buildGrowthLeadsPaginationBaseQuery,
  growthLeadFiltersFromAdminSearchParams,
} from "@/lib/growth/growthAdminLeadsFilters";
import {
  GROWTH_LEADS_PAGE_SIZE_DEFAULT,
  parseGrowthLeadsPage,
  parseGrowthLeadsPageSizeParam,
} from "@/lib/growth/growthLeadListPaging";
import { defaultGrowthMetro, GROWTH_METROS } from "@/lib/growth/marketsConfig";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

  const { marketSlug, filters } = growthLeadFiltersFromAdminSearchParams(p);
  const pageSize = parseGrowthLeadsPageSizeParam(p.perPage);
  const outreachQueue = filters.outreachQueue ?? "all";

  const where = buildGrowthLeadWhere(filters);
  const matchCount = await prisma.growthLead.count({ where });
  const page = parseGrowthLeadsPage(p.page);
  const totalPages = Math.max(1, Math.ceil(matchCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginationBase = buildGrowthLeadsPaginationBaseQuery({
    ...p,
    market: marketSlug,
    queue: outreachQueue === "all" ? undefined : outreachQueue,
    perPage: pageSize === GROWTH_LEADS_PAGE_SIZE_DEFAULT ? undefined : String(pageSize),
  });

  const exportQs = new URLSearchParams();
  for (const [k, v] of Object.entries(paginationBase)) {
    if (v != null && v !== "") exportQs.set(k, v);
  }
  const exportHref = `/internal/admin/growth/leads/export?${exportQs.toString()}`;

  const metro = GROWTH_METROS.find((m) => m.discoveryMarketSlug.toLowerCase() === marketSlug.toLowerCase());

  const quickViewBase = new URLSearchParams();
  quickViewBase.set("market", marketSlug);
  if (p.type?.trim()) quickViewBase.set("type", p.type.trim());

  const hrefAllLeads = `/internal/admin/growth/leads?${quickViewBase.toString()}`;
  const qsEmailReady = new URLSearchParams(quickViewBase);
  qsEmailReady.set("queue", "email_outreach_ready");
  const hrefEmailOutreachReady = `/internal/admin/growth/leads?${qsEmailReady.toString()}`;
  const qsContactPath = new URLSearchParams(quickViewBase);
  qsContactPath.set("queue", "contact_path_queue");
  const hrefContactPathQueue = `/internal/admin/growth/leads?${qsContactPath.toString()}`;

  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-white">Growth leads</h1>
        <Link href="/internal/admin/growth" className="text-sm text-zinc-400 hover:text-white">
          ← Growth hub
        </Link>
      </div>

      <nav
        aria-label="Growth leads quick views"
        className="mt-4 flex flex-col gap-2 rounded-lg border border-zinc-600/80 bg-zinc-950/70 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 sm:mr-1">Full list</span>
        <div className="flex flex-wrap gap-2">
          <Link
            href={hrefAllLeads}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              outreachQueue === "all"
                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                : "border-zinc-600 bg-zinc-900/80 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
            }`}
          >
            All leads
          </Link>
          <Link
            href={hrefEmailOutreachReady}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              outreachQueue === "email_outreach_ready"
                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                : "border-zinc-600 bg-zinc-900/80 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
            }`}
          >
            Email outreach ready
          </Link>
          <Link
            href={hrefContactPathQueue}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              outreachQueue === "contact_path_queue"
                ? "border-sky-500/60 bg-sky-500/15 text-sky-100"
                : "border-zinc-600 bg-zinc-900/80 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
            }`}
          >
            Contact-path queue
          </Link>
          <a
            href={exportHref}
            download
            className="inline-flex items-center rounded-md border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-sm font-medium text-amber-100 hover:border-amber-500 hover:bg-amber-950/60"
          >
            Export current results to CSV
          </a>
        </div>
        <p className="w-full text-[11px] leading-snug text-zinc-500 sm:pl-0">
          Routes: <code className="text-zinc-400">/internal/admin/growth/leads</code> (filters in query). CSV:{" "}
          <code className="text-zinc-400">/internal/admin/growth/leads/export</code> — same query string as this page (exports the{" "}
          <strong className="text-zinc-300">full</strong> filtered set, not only this page).
        </p>
      </nav>

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
              {Array.from(new Set([25, 50, 75, 100, 200, 500, pageSize].sort((a, b) => a - b))).map((n) => (
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
