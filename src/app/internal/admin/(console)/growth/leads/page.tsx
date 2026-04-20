import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { GrowthLeadsFilteredTable } from "@/app/internal/admin/(console)/growth/_components/GrowthLeadsFilteredTable";
import type { Prisma } from "@/generated/prisma/client";
import { buildGrowthLeadWhere, type GrowthLeadListFilters } from "@/lib/growth/growthLeadFilters";
import type { AdminGrowthLeadsSearchParams } from "@/lib/growth/growthAdminLeadsFilters";
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

function growthLeadsListHref(entries: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(entries)) {
    if (v != null && v !== "") q.set(k, v);
  }
  const s = q.toString();
  return s ? `/internal/admin/growth/leads?${s}` : "/internal/admin/growth/leads";
}

function growthLeadsPaginationQuery(
  p: AdminGrowthLeadsSearchParams,
  opts: { marketSlug: string | null; perPage: string | undefined; queue?: string },
): Record<string, string | undefined> {
  return buildGrowthLeadsPaginationBaseQuery({
    ...p,
    market: opts.marketSlug != null && opts.marketSlug !== "" ? opts.marketSlug : undefined,
    queue: opts.queue,
    perPage: opts.perPage,
  });
}

export default async function AdminGrowthLeadsPage(props: { searchParams: Promise<AdminGrowthLeadsSearchParams> }) {
  await assertAdminSession();
  const p = await props.searchParams;
  const prisma = requirePrisma();

  const { marketSlug, filters } = growthLeadFiltersFromAdminSearchParams(p);
  const pageSize = parseGrowthLeadsPageSizeParam(p.perPage);
  const outreachQueue = filters.outreachQueue ?? "all";

  const backlogCountFilters: GrowthLeadListFilters = {
    ...filters,
    outreachQueue: "usable_email_backlog",
    sourceKinds: null,
  };
  const whereUsableAll = buildGrowthLeadWhere(backlogCountFilters);
  const whereUsableUploaded = buildGrowthLeadWhere({
    ...backlogCountFilters,
    sourceKinds: ["CSV_IMPORT", "CLAUDE_CSV"],
  });
  const whereUsableDiscovered: Prisma.GrowthLeadWhereInput = {
    AND: [whereUsableAll, { sourceKind: { notIn: ["CSV_IMPORT", "CLAUDE_CSV"] } }],
  };

  const where = buildGrowthLeadWhere(filters);
  const [matchCount, countUsableAll, countUsableUploaded, countUsableDiscovered] = await Promise.all([
    prisma.growthLead.count({ where }),
    prisma.growthLead.count({ where: whereUsableAll }),
    prisma.growthLead.count({ where: whereUsableUploaded }),
    prisma.growthLead.count({ where: whereUsableDiscovered }),
  ]);
  const page = parseGrowthLeadsPage(p.page);
  const totalPages = Math.max(1, Math.ceil(matchCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const perPageForQuery = pageSize === GROWTH_LEADS_PAGE_SIZE_DEFAULT ? undefined : String(pageSize);
  const queueForPagination = outreachQueue === "all" ? undefined : outreachQueue;

  const paginationBase = growthLeadsPaginationQuery(p, {
    marketSlug,
    perPage: perPageForQuery,
    queue: queueForPagination,
  });

  const exportQs = new URLSearchParams();
  for (const [k, v] of Object.entries(paginationBase)) {
    if (v != null && v !== "") exportQs.set(k, v);
  }
  const exportHref = `/internal/admin/growth/leads/export?${exportQs.toString()}`;

  const metro = marketSlug
    ? GROWTH_METROS.find((m) => m.discoveryMarketSlug.toLowerCase() === marketSlug.toLowerCase())
    : undefined;

  const withQueue = (queue?: string) =>
    growthLeadsListHref(
      growthLeadsPaginationQuery(p, {
        marketSlug,
        perPage: perPageForQuery,
        queue,
      }),
    );

  const hrefAllLeads = withQueue(undefined);
  const hrefEmailOutreachReady = withQueue("email_outreach_ready");
  const hrefUsableEmailBacklog = withQueue("usable_email_backlog");
  const hrefValidHighMediumEmail = withQueue("valid_high_medium_email");
  const hrefUsableUploadImports = growthLeadsListHref({
    ...growthLeadsPaginationQuery(p, { marketSlug, perPage: perPageForQuery, queue: "usable_email_backlog" }),
    sourceKind: "CSV_IMPORT,CLAUDE_CSV",
  });
  const hrefContactPathQueue = withQueue("contact_path_queue");
  const hrefEmailPipeline = withQueue("email_pipeline");
  const hrefSocialPathQueue = withQueue("social_path_queue");
  const hrefLeadsEmailSortSameScope = growthLeadsListHref(
    growthLeadsPaginationQuery(p, { marketSlug, perPage: perPageForQuery, queue: undefined }),
  );
  const hrefAllMarketsSameFilters = growthLeadsListHref(
    growthLeadsPaginationQuery(p, {
      marketSlug: null,
      perPage: perPageForQuery,
      queue: queueForPagination,
    }),
  );

  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-white">Growth leads</h1>
        <Link href="/internal/admin/growth" className="text-sm text-zinc-400 hover:text-white">
          ← Growth hub
        </Link>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 font-medium ${
            marketSlug
              ? "border-sky-500/40 bg-sky-500/10 text-sky-100"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
          }`}
        >
          {marketSlug ? `Market filter: ${metro?.label ?? marketSlug}` : "All markets (no discovery slug filter)"}
        </span>
      </p>

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
            href={hrefUsableEmailBacklog}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              outreachQueue === "usable_email_backlog"
                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                : "border-zinc-600 bg-zinc-900/80 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
            }`}
          >
            Full usable-email backlog
          </Link>
          <Link
            href={hrefValidHighMediumEmail}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              outreachQueue === "valid_high_medium_email"
                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-100"
                : "border-zinc-600 bg-zinc-900/80 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
            }`}
          >
            Automation tier (HIGH/MEDIUM only)
          </Link>
          <Link
            href={hrefUsableUploadImports}
            className="rounded-md border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
          >
            Usable-email — CSV / Claude uploads only
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
        <div className="w-full rounded-md border border-zinc-700/80 bg-black/30 px-3 py-2 text-[11px] text-zinc-400">
          <span className="font-semibold uppercase tracking-wide text-zinc-500">Usable-email backlog</span> (same filters + market
          scope as this page, ignoring <code className="text-zinc-500">sourceKind</code>):{" "}
          <Link className="text-emerald-400 hover:text-emerald-300" href={hrefUsableEmailBacklog}>
            all {countUsableAll}
          </Link>
          {" · "}
          <Link className="text-emerald-400/90 hover:text-emerald-300" href={hrefUsableUploadImports}>
            uploaded (CSV/Claude) {countUsableUploaded}
          </Link>
          {" · "}
          <span className="text-zinc-500">discovered + other paths {countUsableDiscovered}</span>
        </div>
        <p className="w-full text-[11px] leading-snug text-zinc-500 sm:pl-0">
          Routes: <code className="text-zinc-400">/internal/admin/growth/leads</code> (omit <code className="text-zinc-500">market</code>{" "}
          for all markets; optional <code className="text-zinc-500">sourceKind=CSV_IMPORT,CLAUDE_CSV</code>). CSV:{" "}
          <code className="text-zinc-400">/internal/admin/growth/leads/export</code> — same query string as this page (exports the{" "}
          <strong className="text-zinc-300">full</strong> filtered set, not only this page).
        </p>
      </nav>

      <p className="mt-1 text-xs text-zinc-500">
        {marketSlug ? (
          <>
            Scoped to <strong className="text-zinc-300">{metro?.label ?? marketSlug}</strong> (
            <code className="text-zinc-400">{marketSlug}</code>).
          </>
        ) : (
          <>
            <strong className="text-zinc-300">All markets</strong> — no default slug filter (saved Chicagoland shortcuts below still
            pass <code className="text-zinc-400">market=chicagoland-il</code> explicitly).
          </>
        )}{" "}
        {matchCount} lead{matchCount === 1 ? "" : "s"} match current filters (paginated; no fixed row cap).
      </p>

      <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-medium text-white">Outreach queues</h2>
        <p className="mt-1 text-xs text-zinc-500">
          The main <code className="text-zinc-400">GrowthLead</code> table only accepts new rows when discovery/import extracts at
          least one parsed-valid email. Use <strong className="text-zinc-300">Full usable-email backlog</strong> + Export for every
          stored mailbox (HIGH/MEDIUM/LOW parse confidence — same table for uploads and discovery). Use{" "}
          <strong className="text-zinc-300">Automation tier (HIGH/MEDIUM only)</strong> to match auto-draft/send gates (LOW still
          visible in the full backlog). Secondary queues keep contact URLs and socials for manual follow-up. Email outreach-ready
          adds status + discovery-confidence gates; suppression still applies at send time.
        </p>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          <li>
            <Link className="text-emerald-400 hover:text-emerald-300" href={hrefEmailPipeline}>
              Email pipeline
            </Link>
          </li>
          <li>
            <Link className="text-emerald-400 hover:text-emerald-300" href={hrefEmailOutreachReady}>
              Email outreach-ready
            </Link>
          </li>
          <li>
            <Link className="text-emerald-400 hover:text-emerald-300" href={hrefUsableEmailBacklog}>
              Full usable-email backlog
            </Link>
          </li>
          <li>
            <Link className="text-sky-400 hover:text-sky-300" href={hrefContactPathQueue}>
              Contact-path queue
            </Link>
          </li>
          <li>
            <Link className="text-violet-400 hover:text-violet-300" href={hrefSocialPathQueue}>
              Social / calendar queue
            </Link>
          </li>
          <li>
            <Link className="text-zinc-400 hover:text-zinc-200" href={hrefLeadsEmailSortSameScope}>
              All leads (email-first sort, same scope)
            </Link>
          </li>
        </ul>
      </section>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">Market:</span>
        <Link
          href={hrefAllMarketsSameFilters}
          className={`rounded border px-2 py-1 ${
            marketSlug == null ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
          }`}
        >
          All markets
        </Link>
        {GROWTH_METROS.map((m) => (
          <Link
            key={m.id}
            href={growthLeadsListHref(
              growthLeadsPaginationQuery(p, {
                marketSlug: m.discoveryMarketSlug,
                perPage: perPageForQuery,
                queue: queueForPagination,
              }),
            )}
            className={`rounded border px-2 py-1 ${
              marketSlug != null && m.discoveryMarketSlug.toLowerCase() === marketSlug.toLowerCase()
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
            <span className="text-xs text-zinc-500">Discovery market slug (leave blank for all markets)</span>
            <input
              name="market"
              defaultValue={marketSlug ?? ""}
              placeholder="e.g. chicagoland-il — empty = all"
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
              <option value="usable_email_backlog">Full usable-email backlog (HIGH/MEDIUM/LOW — export)</option>
              <option value="valid_high_medium_email">Automation tier — HIGH/MEDIUM email only</option>
              <option value="blocked_low_confidence_email">Blocked — LOW confidence (has email)</option>
              <option value="blocked_invalid_email">Blocked — invalid / rejected parse</option>
              <option value="no_primary_email">No primary email on lead (legacy / dropped)</option>
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
          <label className="grid gap-1 sm:col-span-2">
            <span className="text-xs text-zinc-500">
              Source kind (comma-separated, e.g. CSV_IMPORT,CLAUDE_CSV or WEBSITE_CONTACT,SCHEDULED_JOB)
            </span>
            <input
              name="sourceKind"
              defaultValue={p.sourceKind ?? ""}
              placeholder="CSV_IMPORT,CLAUDE_CSV"
              className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-xs text-white"
            />
          </label>
        </div>
        <button type="submit" className="rounded-md bg-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-600">
          Apply filters
        </button>
      </form>

      <GrowthLeadsFilteredTable
        filters={filters}
        title={
          marketSlug
            ? metro
              ? `${metro.label} — filtered leads`
              : `${marketSlug} — filtered leads`
            : "All markets — filtered leads"
        }
        totalCount={matchCount}
        page={safePage}
        pageSize={pageSize}
        baseQuery={paginationBase}
      />
    </main>
  );
}
