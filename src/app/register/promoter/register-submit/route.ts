import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPrismaOrNull } from "@/lib/prisma";
import { setSession } from "@/lib/session";
import { consumeRateLimit } from "@/lib/rateLimit";
import { PROMOTER_DASHBOARD_HREF } from "@/lib/safeRedirect";
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
    return redirectTo("/register/promoter?error=unavailable");
  }

  let email: string;
  let password: string;
  try {
    email = reqString(formData, "email").toLowerCase();
    password = reqString(formData, "password");
  } catch {
    return redirectTo("/register/promoter?error=unavailable");
  }

  if (!registrationContentConsentChecked(formData)) {
    return redirectTo("/register/promoter?error=consent");
  }

  const rl = await consumeRateLimit({
    scope: "register:promoter",
    identifier: email,
    limit: 6,
    windowSec: 60 * 60,
  });
  if (!rl.allowed) return redirectTo("/register/promoter?error=rate");

  const passwordHash = await bcrypt.hash(password, 12);

  const prisma = getPrismaOrNull();
  if (!prisma) {
    console.error("[registerPromoter] database not configured");
    return redirectTo("/register/promoter?error=unavailable");
  }

  try {
    const existingUser = await prisma.promoterUser.findUnique({ where: { email } });
    if (existingUser) return redirectTo("/login/promoter");

    const approvedApp = await prisma.promoterApplication.findFirst({
      where: { email, status: "APPROVED" },
      orderBy: { reviewedAt: "desc" },
      select: { id: true },
    });
    if (!approvedApp) {
      return redirectTo("/register/promoter?error=notApproved");
    }

    const alreadyLinked = await prisma.promoterUser.findUnique({
      where: { applicationId: approvedApp.id },
      select: { id: true },
    });
    if (alreadyLinked) return redirectTo("/login/promoter");

    const now = new Date();
    const promoter = await prisma.promoterUser.create({
      data: {
        email,
        passwordHash,
        applicationId: approvedApp.id,
        registrationContentConsentAt: now,
        registrationContentConsentVersion: REGISTRATION_CONTENT_CONSENT_VERSION,
      },
    });

    await setSession({ kind: "promoter", promoterId: promoter.id, email: promoter.email });
    return redirectTo(PROMOTER_DASHBOARD_HREF);
  } catch (e) {
    console.error("[registerPromoter]", e);
    return redirectTo("/register/promoter?error=unavailable");
  }
}
