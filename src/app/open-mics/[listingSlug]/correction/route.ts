import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { isValidPublicSlug } from "@/lib/locationSlugValidation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ listingSlug: string }> },
) {
  const { listingSlug } = await context.params;
  if (!isValidPublicSlug(listingSlug)) {
    return NextResponse.json({ ok: false, error: "Invalid listing" }, { status: 400 });
  }

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "Unavailable" }, { status: 503 });
  }

  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { slug: listingSlug },
    select: { id: true },
  });
  if (!listing) {
    return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 4000) {
    return NextResponse.json({ ok: false, error: "Message required" }, { status: 400 });
  }

  const kind = typeof body.kind === "string" ? body.kind.trim().slice(0, 80) : "correction";
  const reporterName = typeof body.name === "string" ? body.name.trim().slice(0, 200) : null;
  const reporterEmail = typeof body.email === "string" ? body.email.trim().slice(0, 320) : null;

  try {
    await prisma.listingCorrection.create({
      data: {
        listingId: listing.id,
        kind,
        message,
        reporterName: reporterName || null,
        reporterEmail: reporterEmail || null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
