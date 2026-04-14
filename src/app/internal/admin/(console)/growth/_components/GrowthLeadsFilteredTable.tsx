import Link from "next/link";
import type { GrowthLeadListFilters } from "@/lib/growth/growthLeadFilters";
import { buildGrowthLeadWhere } from "@/lib/growth/growthLeadFilters";
import {
  describeGrowthLeadContactPaths,
  growthLeadPipelineBadge,
} from "@/lib/growth/growthLeadContactPathLabel";
import { buildGrowthLeadOrderBy } from "@/lib/growth/growthLeadListOrderBy";
import { requirePrisma } from "@/lib/prisma";
import { clampGrowthLeadPageSize } from "@/lib/growth/growthLeadListPaging";

export { GROWTH_LEADS_PAGE_SIZE_DEFAULT } from "@/lib/growth/growthLeadListPaging";

function badgeClass(badge: ReturnType<typeof growthLeadPipelineBadge>["badge"]): string {
  switch (badge) {
    case "email_ready":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    case "email_review":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    case "contact_path":
      return "border-sky-500/40 bg-sky-500/10 text-sky-200";
    case "social_calendar":
      return "border-violet-500/40 bg-violet-500/10 text-violet-200";
    case "website_only":
      return "border-zinc-600 bg-zinc-800/60 text-zinc-300";
    default:
      return "border-zinc-700 bg-zinc-900/60 text-zinc-500";
  }
}

function buildPageHref(baseQuery: Record<string, string | undefined>, page: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(baseQuery)) {
    if (v != null && v !== "") q.set(k, v);
  }
  if (page > 1) q.set("page", String(page));
  else q.delete("page");
  const s = q.toString();
  return s ? `?${s}` : "?";
}

export async function GrowthLeadsFilteredTable(props: {
  filters: GrowthLeadListFilters;
  title?: string;
  /** 1-based page index */
  page?: number;
  pageSize?: number;
  /** Total rows matching `filters` (parent should use same `buildGrowthLeadWhere`). */
  totalCount: number;
  /** Query params to preserve in pagination links (omit `page`). */
  baseQuery?: Record<string, string | undefined>;
}) {
  const prisma = requirePrisma();
  const where = buildGrowthLeadWhere(props.filters);
  const pageSize = clampGrowthLeadPageSize(props.pageSize);
  const page = Math.max(1, props.page ?? 1);
  const total = props.totalCount;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * pageSize;

  const orderBy = buildGrowthLeadOrderBy(props.filters);

  const rows = await prisma.growthLead.findMany({
    where,
    orderBy,
    skip,
    take: pageSize,
    select: {
      id: true,
      name: true,
      leadType: true,
      status: true,
      city: true,
      suburb: true,
      discoveryMarketSlug: true,
      contactEmailNormalized: true,
      contactEmailConfidence: true,
      contactUrl: true,
      websiteUrl: true,
      instagramUrl: true,
      facebookUrl: true,
      youtubeUrl: true,
      tiktokUrl: true,
      fitScore: true,
      performanceTags: true,
      source: true,
      createdAt: true,
      openMicSignalTier: true,
      contactQuality: true,
      acquisitionStage: true,
      discoveryConfidence: true,
    },
  });

  const baseQuery = props.baseQuery ?? {};
  const prevHref = buildPageHref(baseQuery, Math.max(1, safePage - 1));
  const nextHref = buildPageHref(baseQuery, Math.min(totalPages, safePage + 1));

  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + rows.length, total);

  return (
    <div className="mt-4 overflow-x-auto">
      {props.title ? <h2 className="text-base font-medium text-white">{props.title}</h2> : null}
      <p className="mt-1 text-xs text-zinc-500">
        Showing {from}–{to} of {total} lead{total === 1 ? "" : "s"} ({pageSize} per page). Email-ready rows sort first in
        mixed views. Venue sends stay on existing marketing throttles.
      </p>
      <p className="mt-1 text-[11px] text-zinc-600">
        Non-email targets are stored and can be enqueued as <code className="text-zinc-500">MarketingJob</code> path tasks;
        external contact forms are not auto-submitted.
      </p>
      <table className="mt-3 w-full min-w-[1180px] text-left text-xs text-zinc-400">
        <thead>
          <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-2">Pipeline</th>
            <th className="py-2 pr-2">Path types</th>
            <th className="py-2 pr-2">Name</th>
            <th className="py-2 pr-2">Type</th>
            <th className="py-2 pr-2">Status</th>
            <th className="py-2 pr-2">Suburb / city</th>
            <th className="py-2 pr-2">Market</th>
            <th className="py-2 pr-2">Email / conf</th>
            <th className="py-2 pr-2">Primary URL</th>
            <th className="py-2 pr-2">Fit</th>
            <th className="py-2 pr-2">OM</th>
            <th className="py-2 pr-2">Disc. conf</th>
            <th className="py-2 pr-2">Acq.</th>
            <th className="py-2 pr-2">Tags</th>
            <th className="py-2">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const { badge, label } = growthLeadPipelineBadge({
              contactQuality: r.contactQuality,
              contactEmailNormalized: r.contactEmailNormalized,
              contactEmailConfidence: r.contactEmailConfidence,
            });
            const paths = describeGrowthLeadContactPaths({
              contactUrl: r.contactUrl,
              websiteUrl: r.websiteUrl,
              instagramUrl: r.instagramUrl,
              facebookUrl: r.facebookUrl,
              youtubeUrl: r.youtubeUrl,
              tiktokUrl: r.tiktokUrl,
            });
            const pathSummary = paths.length ? paths.join(" · ") : "—";
            return (
              <tr key={r.id} className="border-b border-zinc-800/80">
                <td className="py-2 pr-2 align-top">
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${badgeClass(badge)}`}
                  >
                    {label}
                  </span>
                </td>
                <td className="max-w-[200px] py-2 pr-2 align-top text-[10px] text-zinc-500">{pathSummary}</td>
                <td className="py-2 pr-2 align-top">
                  <Link className="text-emerald-400 hover:text-emerald-300" href={`/internal/admin/growth/leads/${r.id}`}>
                    {r.name}
                  </Link>
                </td>
                <td className="py-2 pr-2 align-top text-zinc-300">{r.leadType}</td>
                <td className="py-2 pr-2 align-top text-zinc-200">{r.status}</td>
                <td className="py-2 pr-2 align-top">
                  {[r.suburb, r.city].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="py-2 pr-2 align-top font-mono text-[10px]">{r.discoveryMarketSlug ?? "—"}</td>
                <td className="py-2 pr-2 align-top font-mono text-[10px]">
                  {r.contactEmailNormalized ? (
                    <>
                      {r.contactEmailNormalized}
                      <span className="block text-zinc-600">{r.contactEmailConfidence ?? "—"}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="max-w-[180px] break-all py-2 pr-2 align-top font-mono text-[10px] text-zinc-500">
                  {r.contactUrl ?? r.websiteUrl ?? r.instagramUrl ?? r.facebookUrl ?? "—"}
                </td>
                <td className="py-2 pr-2 align-top">{r.fitScore ?? "—"}</td>
                <td className="py-2 pr-2 align-top font-mono text-[10px]">{r.openMicSignalTier ?? "—"}</td>
                <td className="py-2 pr-2 align-top font-mono text-[10px]">{r.discoveryConfidence ?? "—"}</td>
                <td className="py-2 pr-2 align-top font-mono text-[10px]">{r.acquisitionStage}</td>
                <td className="py-2 pr-2 align-top">{r.performanceTags.join(", ") || "—"}</td>
                <td className="py-2 align-top">{r.source ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No leads match filters.</p> : null}

      {totalPages > 1 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
          {safePage > 1 ? (
            <Link className="rounded border border-zinc-700 px-3 py-1 hover:border-zinc-500" href={prevHref}>
              ← Previous
            </Link>
          ) : (
            <span className="rounded border border-zinc-800 px-3 py-1 text-zinc-600">← Previous</span>
          )}
          <span className="text-xs text-zinc-500">
            Page {safePage} / {totalPages}
          </span>
          {safePage < totalPages ? (
            <Link className="rounded border border-zinc-700 px-3 py-1 hover:border-zinc-500" href={nextHref}>
              Next →
            </Link>
          ) : (
            <span className="rounded border border-zinc-800 px-3 py-1 text-zinc-600">Next →</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
