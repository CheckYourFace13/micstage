import { NextResponse } from "next/server";
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

  const url = new URL(request.url);
  const single = url.searchParams.get("url")?.trim();
  const result = await runSearchEngineIndexPing(single ? { urls: [single] } : undefined);

  return NextResponse.json(
    {
      ok: result.indexNow.ok || result.bing.ok,
      ...result,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
