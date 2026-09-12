import { NextResponse } from "next/server";
import {
  isGrowthLeadId,
  leadTypeForRegistrationRole,
  stampRegistrationFormStarted,
  type RegistrationFunnelRole,
} from "@/lib/growth/growthLeadAcquisitionStage";
import { getPrismaOrNull } from "@/lib/prisma";

export const runtime = "nodejs";

const ROLES = new Set<RegistrationFunnelRole>(["venue", "host", "performer"]);

/**
 * Lightweight idempotent signal: first genuine registration form interaction
 * for an attributed GrowthLead. Failure must never block the registration UI.
 */
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const growthLeadId =
      body && typeof body === "object" && "growthLeadId" in body
        ? String((body as { growthLeadId?: unknown }).growthLeadId ?? "")
        : "";
    const roleRaw =
      body && typeof body === "object" && "role" in body
        ? String((body as { role?: unknown }).role ?? "")
        : "";
    const event =
      body && typeof body === "object" && "event" in body
        ? String((body as { event?: unknown }).event ?? "")
        : "";

    if (!isGrowthLeadId(growthLeadId)) {
      return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 400 });
    }
    if (!ROLES.has(roleRaw as RegistrationFunnelRole)) {
      return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
    }
    if (event !== "form_started") {
      return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
    }

    const role = roleRaw as RegistrationFunnelRole;
    const leadType = leadTypeForRegistrationRole(role);
    const prisma = getPrismaOrNull();
    if (!prisma) {
      return NextResponse.json({ ok: true, skipped: "no_db" });
    }

    await stampRegistrationFormStarted(prisma, growthLeadId.trim(), { leadType });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[registration-funnel]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: true, skipped: "error" });
  }
}
