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
    select: { id: true, claimStatus: true, claimedVenueId: true },
  });
  if (!listing) {
    return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });
  }
  if (listing.claimedVenueId || listing.claimStatus === "CLAIMED") {
    return NextResponse.json({ ok: false, error: "This listing is already claimed." }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const contactName = typeof body.contactName === "string" ? body.contactName.trim().slice(0, 200) : "";
  const role = typeof body.role === "string" ? body.role.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 320) : "";
  if (!contactName || !email) {
    return NextResponse.json({ ok: false, error: "Name and email required" }, { status: 400 });
  }

  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : null;
  const proofUrl = typeof body.proofUrl === "string" ? body.proofUrl.trim().slice(0, 500) : null;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : null;
  const desiredLoginEmail =
    typeof body.desiredLoginEmail === "string" ? body.desiredLoginEmail.trim().slice(0, 320) : null;

  try {
    await prisma.$transaction([
      prisma.listingClaimRequest.create({
        data: {
          listingId: listing.id,
          contactName,
          role: role || "host",
          email,
          phone: phone || null,
          proofUrl: proofUrl || null,
          notes: notes || null,
          desiredLoginEmail: desiredLoginEmail || null,
        },
      }),
      prisma.publicOpenMicListing.update({
        where: { id: listing.id },
        data: { claimStatus: "CLAIM_PENDING" },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
