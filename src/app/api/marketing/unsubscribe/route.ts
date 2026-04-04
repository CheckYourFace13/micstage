import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { verifyMarketingUnsubscribeSignature } from "@/lib/marketing/unsubscribeSigning";

export const dynamic = "force-dynamic";

async function applyUnsubscribe(contactId: string): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return { ok: false, status: 503, message: "Service unavailable" };
  }
  const now = new Date();
  try {
    await prisma.marketingContact.update({
      where: { id: contactId },
      data: {
        status: "UNSUBSCRIBED",
        marketingUnsubscribedAt: now,
      },
    });
  } catch {
    return { ok: false, status: 404, message: "Contact not found" };
  }
  const email = await prisma.marketingContact.findUnique({
    where: { id: contactId },
    select: { emailNormalized: true },
  });
  if (email?.emailNormalized) {
    await prisma.marketingEmailSuppression.upsert({
      where: { emailNormalized: email.emailNormalized },
      create: {
        emailNormalized: email.emailNormalized,
        reason: "UNSUBSCRIBE",
        sourceNote: "one-click or link unsubscribe",
      },
      update: { reason: "UNSUBSCRIBE", sourceNote: "one-click or link unsubscribe" },
    });
  }
  return { ok: true };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = new URL(req.url).origin;
  const contactId = url.searchParams.get("contactId")?.trim();
  const sig = url.searchParams.get("sig")?.trim();
  if (!contactId || !sig || !verifyMarketingUnsubscribeSignature(contactId, sig)) {
    return NextResponse.redirect(new URL("/unsubscribe?err=invalid", base), 303);
  }
  const r = await applyUnsubscribe(contactId);
  if (!r.ok) {
    return NextResponse.redirect(new URL("/unsubscribe?err=failed", base), 303);
  }
  return NextResponse.redirect(new URL("/unsubscribe?ok=1", base), 303);
}

/** RFC 8058 one-click: POST with body `List-Unsubscribe=One-Click`. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let contactId = url.searchParams.get("contactId")?.trim();
  let sig = url.searchParams.get("sig")?.trim();

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const body = await req.text();
    const params = new URLSearchParams(body);
    if (params.get("List-Unsubscribe") === "One-Click") {
      contactId = contactId ?? params.get("contactId")?.trim();
      sig = sig ?? params.get("sig")?.trim();
    }
  }

  if (!contactId || !sig || !verifyMarketingUnsubscribeSignature(contactId, sig)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const r = await applyUnsubscribe(contactId);
  if (!r.ok) {
    return NextResponse.json({ error: r.message }, { status: r.status });
  }
  return NextResponse.json({ ok: true });
}
