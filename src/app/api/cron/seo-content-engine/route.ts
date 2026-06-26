import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/publicSeo";
import { getNewlyPublishedResourceArticles } from "@/lib/seo/contentEngine/publish";
import { runSearchEngineIndexPing } from "@/lib/seo/searchEnginePing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) return true;
  return request.headers.get("x-micstage-cron-secret") === expected;
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const newlyPublished = getNewlyPublishedResourceArticles();
  const urls = [
    absoluteUrl("/resources"),
    ...newlyPublished.map((a) => absoluteUrl(`/resources/${a.slug}`)),
  ];

  const ping =
    urls.length > 1
      ? await runSearchEngineIndexPing({ urls })
      : { sitemapUrl: `${absoluteUrl("/sitemap.xml")}`, urlCount: 0, indexNow: { ok: true, status: 0, submitted: 0 }, bing: { ok: true, status: 0 }, googleNote: "No new articles today" };

  return NextResponse.json(
    {
      ok: true,
      newlyPublished: newlyPublished.map((a) => ({ slug: a.slug, title: a.title, publishedAt: a.publishedAt })),
      ping,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
