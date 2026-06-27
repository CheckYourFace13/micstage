import { NextResponse } from "next/server";
import type { OpenMicDemandRequestKind } from "@/generated/prisma/client";
import { attachDemandToGrowthLead } from "@/lib/publicListings/demandToGrowthLead";
import { getPrismaOrNull } from "@/lib/prisma";

export const runtime = "nodejs";

const ALLOWED: OpenMicDemandRequestKind[] = [
  "REQUEST_CITY",
  "REMINDER_NEARBY",
  "ADD_VENUE",
  "REQUEST_VENUE",
  "PERFORM_HERE",
];

export async function POST(request: Request) {
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "Unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const kind = body.kind as OpenMicDemandRequestKind;
  if (!ALLOWED.includes(kind)) {
    return NextResponse.json({ ok: false, error: "Invalid kind" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().slice(0, 320) : null;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : null;
  const city = typeof body.city === "string" ? body.city.trim().slice(0, 120) : null;
  const region = typeof body.region === "string" ? body.region.trim().slice(0, 80) : null;
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : null;
  const venueName = typeof body.venueName === "string" ? body.venueName.trim().slice(0, 200) : null;
  const listingSlug = typeof body.listingSlug === "string" ? body.listingSlug.trim().slice(0, 120) : null;

  try {
    const row = await prisma.openMicDemandRequest.create({
      data: {
        kind,
        email: email || null,
        name: name || null,
        city: city || null,
        region: region || null,
        venueName: venueName || null,
        listingSlug: listingSlug || null,
        message: message || null,
      },
    });

    let growthLeadId: string | null = null;
    try {
      growthLeadId = await attachDemandToGrowthLead(prisma, row);
    } catch {
      // Demand row saved; growth mirror is best-effort.
    }

    return NextResponse.json({ ok: true, id: row.id, growthLeadId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
