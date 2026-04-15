import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPrismaOrNull } from "@/lib/prisma";
import { setSession } from "@/lib/session";
import { consumeRateLimit } from "@/lib/rateLimit";
import { JOINED_MUSICIAN, PRODUCT_ANALYTICS_QS } from "@/lib/productAnalytics";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";
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

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/register/musician?error=unavailable");
  }

  let email: string;
  let password: string;
  let stageName: string;
  try {
    email = reqString(formData, "email").toLowerCase();
    password = reqString(formData, "password");
    stageName = reqString(formData, "stageName");
  } catch {
    return redirectTo("/register/musician?error=unavailable");
  }

  if (!registrationContentConsentChecked(formData)) {
    return redirectTo("/register/musician?error=consent");
  }

  const rl = await consumeRateLimit({
    scope: "register:musician",
    identifier: email,
    limit: 6,
    windowSec: 60 * 60,
  });
  if (!rl.allowed) return redirectTo("/register/musician?error=rate");

  const passwordHash = await bcrypt.hash(password, 12);

  const prisma = getPrismaOrNull();
  if (!prisma) {
    console.error("[registerMusician] database not configured");
    return redirectTo("/register/musician?error=unavailable");
  }

  try {
    const existing = await prisma.musicianUser.findUnique({ where: { email } });
    if (existing) return redirectTo("/login/musician");

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
    return redirectTo(`${ARTIST_DASHBOARD_HREF}?${PRODUCT_ANALYTICS_QS.joined}=${JOINED_MUSICIAN}`);
  } catch (e) {
    console.error("[registerMusician]", e);
    return redirectTo("/register/musician?error=unavailable");
  }
}

