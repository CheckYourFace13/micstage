import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { venueIdsForVenueSession } from "@/lib/authz";
import { requirePrisma } from "@/lib/prisma";
import { assertImportableHttpUrl } from "@/lib/publicHttpUrl";
import { scrapeWebsiteProfileHints } from "@/lib/websiteProfileHints";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  const allowed = await venueIdsForVenueSession(session);
  let body: { venueId?: string; websiteUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const venueId = typeof body.venueId === "string" ? body.venueId.trim() : "";
  if (!venueId || !allowed.includes(venueId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let url = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
  if (!url) {
    const v = await requirePrisma().venue.findUnique({
      where: { id: venueId },
      select: { websiteUrl: true },
    });
    url = v?.websiteUrl?.trim() ?? "";
  }
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
    console.error("[venue-website-hints]", e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
