import { NextResponse } from "next/server";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { getPrismaOrNull } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const GROWTH_LEAD_ID_RE = /^c[a-z0-9]{24}$/i;

/** Private write path for listing `?growthLead=` clicks — never CDN-cached. */
export async function POST(req: Request) {
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }

  let body: { growthLeadId?: string } = {};
  try {
    body = (await req.json()) as { growthLeadId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const id = typeof body.growthLeadId === "string" ? body.growthLeadId.trim() : "";
  if (!GROWTH_LEAD_ID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const lead = await prisma.growthLead.findUnique({
    where: { id },
    select: { leadType: true },
  });
  const leadType =
    lead?.leadType === "PROMOTER_ACCOUNT" || lead?.leadType === "ARTIST" || lead?.leadType === "VENUE"
      ? lead.leadType
      : "VENUE";

  await advanceGrowthLeadAcquisitionStage(prisma, id, "CLICKED", { leadType });

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } },
  );
}
