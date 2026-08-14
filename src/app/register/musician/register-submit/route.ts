import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { getPrismaOrNull } from "@/lib/prisma";
import { setSession } from "@/lib/session";
import { consumeRateLimit } from "@/lib/rateLimit";
import { JOINED_MUSICIAN, PRODUCT_ANALYTICS_QS } from "@/lib/productAnalytics";
import { safeAfterMusicianLoginPath } from "@/lib/safeRedirect";
import {
  REGISTRATION_CONTENT_CONSENT_VERSION,
  registrationContentConsentChecked,
} from "@/lib/registrationConsent";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";

export const runtime = "nodejs";

function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`${key} is required`);
  return v.trim();
}

function redirectTo(path: string) {
  return NextResponse.redirect(absoluteServerRedirectUrl(path));
}

function optString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim();
}

function registerErrorPath(code: string, next: string | null) {
  const base = `/register/musician?error=${code}`;
  if (!next) return base;
  return `${base}&next=${encodeURIComponent(next)}`;
}

function withJoinedAnalytics(dest: string): string {
  const sep = dest.includes("?") ? "&" : "?";
  return `${dest}${sep}${PRODUCT_ANALYTICS_QS.joined}=${JOINED_MUSICIAN}`;
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/register/musician?error=unavailable");
  }

  const nextRaw = optString(formData, "next");

  let email: string;
  let password: string;
  let stageName: string;
  try {
    email = reqString(formData, "email").toLowerCase();
    password = reqString(formData, "password");
    stageName = reqString(formData, "stageName");
  } catch {
    return redirectTo(registerErrorPath("unavailable", nextRaw));
  }

  if (!registrationContentConsentChecked(formData)) {
    return redirectTo(registerErrorPath("consent", nextRaw));
  }

  const rl = await consumeRateLimit({
    scope: "register:musician",
    identifier: email,
    limit: 6,
    windowSec: 60 * 60,
  });
  if (!rl.allowed) return redirectTo(registerErrorPath("rate", nextRaw));

  const passwordHash = await bcrypt.hash(password, 12);
  const growthTraceLeadId = optString(formData, "growthTraceLeadId");

  const prisma = getPrismaOrNull();
  if (!prisma) {
    console.error("[registerMusician] database not configured");
    return redirectTo(registerErrorPath("unavailable", nextRaw));
  }

  try {
    const existing = await prisma.musicianUser.findUnique({ where: { email } });
    if (existing) {
      const loginNext = nextRaw ? `?next=${encodeURIComponent(nextRaw)}` : "";
      return redirectTo(`/login/musician${loginNext}`);
    }

    const now = new Date();
    const musician = await prisma.musicianUser.create({
      data: {
        email,
        passwordHash,
        stageName,
        registrationContentConsentAt: now,
        registrationContentConsentVersion: REGISTRATION_CONTENT_CONSENT_VERSION,
      },
    });

    await setSession({ kind: "musician", musicianId: musician.id, email: musician.email });

    if (growthTraceLeadId) {
      const lead = await prisma.growthLead.findFirst({
        where: { id: growthTraceLeadId, leadType: "ARTIST" },
        select: { id: true, contactEmailNormalized: true },
      });
      if (lead) {
        await advanceGrowthLeadAcquisitionStage(prisma, lead.id, "ACCOUNT_CREATED", { leadType: "ARTIST" });
        const regEmail = normalizeMarketingEmail(email);
        const leadEmail = lead.contactEmailNormalized ? normalizeMarketingEmail(lead.contactEmailNormalized) : null;
        if (leadEmail && leadEmail === regEmail) {
          await prisma.growthLead.update({
            where: { id: lead.id },
            data: { status: "JOINED" },
          });
        }
      }
    }

    const dest = safeAfterMusicianLoginPath(nextRaw);
    return redirectTo(withJoinedAnalytics(dest));
  } catch (e) {
    console.error("[registerMusician]", e);
    return redirectTo(registerErrorPath("unavailable", nextRaw));
  }
}
