import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminSessionNodeToken, getAdminSecretOrNull } from "@/lib/adminAuth";
import { ADMIN_COOKIE_NAME } from "@/lib/adminEdge";
import {
  adminGrowthLeadsSearchParamsFromUrl,
  growthLeadFiltersFromAdminSearchParams,
} from "@/lib/growth/growthAdminLeadsFilters";
import { buildGrowthLeadWhere } from "@/lib/growth/growthLeadFilters";
import { buildGrowthLeadOrderBy } from "@/lib/growth/growthLeadListOrderBy";
import { GROWTH_LEADS_PAGE_SIZE_MAX } from "@/lib/growth/growthLeadListPaging";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : typeof v === "number" ? String(v) : v;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_HEADER = [
  "id",
  "name",
  "leadType",
  "status",
  "city",
  "suburb",
  "discoveryMarketSlug",
  "contactEmailNormalized",
  "contactEmailConfidence",
  "contactUrl",
  "websiteUrl",
  "instagramUrl",
  "facebookUrl",
  "youtubeUrl",
  "tiktokUrl",
  "fitScore",
  "performanceTags",
  "source",
  "sourceKind",
  "discoveryConfidence",
  "openMicSignalTier",
  "contactQuality",
  "acquisitionStage",
  "createdAt",
].join(",");

export async function GET(request: Request) {
  const secret = getAdminSecretOrNull();
  if (!secret) {
    return new NextResponse("Admin not configured.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const jar = await cookies();
  const tok = jar.get(ADMIN_COOKIE_NAME)?.value;
  if (!tok || tok !== adminSessionNodeToken(secret)) {
    return new NextResponse("Unauthorized", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const url = new URL(request.url);
  const adminParams = adminGrowthLeadsSearchParamsFromUrl(url.searchParams);
  const { filters } = growthLeadFiltersFromAdminSearchParams(adminParams);
  const where = buildGrowthLeadWhere(filters);
  const orderBy = [...buildGrowthLeadOrderBy(filters), { id: "asc" as const }];

  const prisma = requirePrisma();
  const filename = `growth-leads-${new Date().toISOString().slice(0, 10)}.csv`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`${CSV_HEADER}\n`));
      let skip = 0;
      for (;;) {
        const rows = await prisma.growthLead.findMany({
          where,
          orderBy,
          skip,
          take: GROWTH_LEADS_PAGE_SIZE_MAX,
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
            sourceKind: true,
            discoveryConfidence: true,
            openMicSignalTier: true,
            contactQuality: true,
            acquisitionStage: true,
            createdAt: true,
          },
        });
        for (const r of rows) {
          const line = [
            csvCell(r.id),
            csvCell(r.name),
            csvCell(r.leadType),
            csvCell(r.status),
            csvCell(r.city),
            csvCell(r.suburb),
            csvCell(r.discoveryMarketSlug),
            csvCell(r.contactEmailNormalized),
            csvCell(r.contactEmailConfidence),
            csvCell(r.contactUrl),
            csvCell(r.websiteUrl),
            csvCell(r.instagramUrl),
            csvCell(r.facebookUrl),
            csvCell(r.youtubeUrl),
            csvCell(r.tiktokUrl),
            csvCell(r.fitScore),
            csvCell(r.performanceTags.join("|")),
            csvCell(r.source),
            csvCell(r.sourceKind),
            csvCell(r.discoveryConfidence),
            csvCell(r.openMicSignalTier),
            csvCell(r.contactQuality),
            csvCell(r.acquisitionStage),
            csvCell(r.createdAt.toISOString()),
          ].join(",");
          controller.enqueue(encoder.encode(`${line}\n`));
        }
        if (rows.length < GROWTH_LEADS_PAGE_SIZE_MAX) break;
        skip += GROWTH_LEADS_PAGE_SIZE_MAX;
      }
      controller.close();
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
