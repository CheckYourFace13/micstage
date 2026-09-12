import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { linkRegistrationToGrowthLead } from "@/lib/growth/linkRegistrationToGrowthLead";
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

function registerErrorPath(
  code: string,
  next: string | null,
  opts?: { email?: string; stageName?: string; growthTraceLeadId?: string | null },
) {
  const qs = new URLSearchParams();
  qs.set("error", code);
  if (next) qs.set("next", next);
  if (opts?.email) qs.set("email", opts.email);
  if (opts?.stageName) qs.set("stageName", opts.stageName);
  if (opts?.growthTraceLeadId) qs.set("growthLead", opts.growthTraceLeadId);
  return `/register/musician?${qs.toString()}`;
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

  const growthTraceLeadId = optString(formData, "growthTraceLeadId");
  const errOpts = { email, stageName, growthTraceLeadId };

  if (!registrationContentConsentChecked(formData)) {
    return redirectTo(registerErrorPath("consent", nextRaw, errOpts));
  }

  const rl = await consumeRateLimit({
    scope: "register:musician",
    identifier: email,
    limit: 6,
    windowSec: 60 * 60,
  });
  if (!rl.allowed) return redirectTo(registerErrorPath("rate", nextRaw, errOpts));

  const passwordHash = await bcrypt.hash(password, 12);

  const prisma = getPrismaOrNull();
  if (!prisma) {
    console.error("[registerMusician] database not configured");
    return redirectTo(registerErrorPath("unavailable", nextRaw, errOpts));
  }

  try {
    const existing = await prisma.musicianUser.findUnique({ where: { email } });
    if (existing) {
      return redirectTo(registerErrorPath("exists", nextRaw, errOpts));
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

    await linkRegistrationToGrowthLead(prisma, {
      leadType: "ARTIST",
      growthTraceLeadId,
      registrationEmail: email,
    });

    const dest = safeAfterMusicianLoginPath(nextRaw);
    return redirectTo(withJoinedAnalytics(dest));
  } catch (e) {
    console.error("[registerMusician]", e);
    return redirectTo(registerErrorPath("unavailable", nextRaw, errOpts));
  }
}
