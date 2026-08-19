import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { venueIdsForVenueSession } from "@/lib/authz";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";
import { consumeRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ nightId: string }> }) {
  const { nightId } = await ctx.params;
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.redirect(absoluteServerRedirectUrl(`/nights/${nightId}/lineup?dispute=unavailable`));
  }

  const rl = await consumeRateLimit({
    scope: "host-night-dispute",
    identifier: nightId,
    limit: 5,
    windowSec: 3600,
  });
  if (!rl.allowed) {
    return NextResponse.redirect(absoluteServerRedirectUrl(`/nights/${nightId}/lineup?dispute=rate`));
  }

  let reason = "";
  try {
    const form = await request.formData();
    reason = form.get("reason")?.toString().trim().slice(0, 500) || "Reported as incorrect venue association";
  } catch {
    reason = "Reported as incorrect venue association";
  }

  const night = await prisma.promoterNight.findUnique({
    where: { id: nightId },
    select: { id: true, venueId: true },
  });
  if (!night) {
    return NextResponse.redirect(absoluteServerRedirectUrl("/find-open-mics"));
  }

  const session = await getSession();
  let reporterVenueOwnerId: string | null = null;
  let reporterEmail: string | null = null;
  if (session?.kind === "venue") {
    const venueIds = await venueIdsForVenueSession(session);
    if (venueIds.includes(night.venueId)) {
      reporterVenueOwnerId = session.venueOwnerId ?? null;
      reporterEmail = session.email ?? null;
    }
  }

  await prisma.hostNightVenueDispute.create({
    data: {
      promoterNightId: night.id,
      venueId: night.venueId,
      reason,
      reporterEmail: reporterEmail ?? null,
      reporterVenueOwnerId,
    },
  });

  return NextResponse.redirect(absoluteServerRedirectUrl(`/nights/${nightId}/lineup?dispute=received`));
}
