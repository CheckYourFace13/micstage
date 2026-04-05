import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertImportableHttpUrl } from "@/lib/publicHttpUrl";
import { scrapeWebsiteProfileHints } from "@/lib/websiteProfileHints";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.kind !== "musician") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { websiteUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const url = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "need_url" }, { status: 400 });
  }
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    assertImportableHttpUrl(normalized);
  } catch {
    return NextResponse.json({ error: "bad_url" }, { status: 400 });
  }

  try {
    const hints = await scrapeWebsiteProfileHints(normalized);
    return NextResponse.json(hints);
  } catch (e) {
    console.error("[artist-website-hints]", e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
