import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPrismaOrNull } from "@/lib/prisma";
import { setSession } from "@/lib/session";
import { consumeRateLimit } from "@/lib/rateLimit";
import {
  REGISTRATION_CONTENT_CONSENT_VERSION,
  registrationContentConsentChecked,
} from "@/lib/registrationConsent";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";
import { allocateUniqueHostSlug } from "@/lib/host/hostSlug";

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
  let displayName: string;
  try {
    email = reqString(formData, "email").toLowerCase();
    password = reqString(formData, "password");
    displayName = reqString(formData, "displayName").slice(0, 80);
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
    console.error("[registerHost] database not configured");
    return redirectTo("/register/promoter?error=unavailable");
  }

  try {
    const existingUser = await prisma.promoterUser.findUnique({ where: { email } });
    if (existingUser) return redirectTo("/login/promoter");

    const hostSlug = await allocateUniqueHostSlug(displayName, async (slug) => {
      const row = await prisma.promoterUser.findUnique({ where: { hostSlug: slug }, select: { id: true } });
      return Boolean(row);
    });

    const now = new Date();
    const promoter = await prisma.promoterUser.create({
      data: {
        email,
        passwordHash,
        displayName,
        hostSlug,
        registrationContentConsentAt: now,
        registrationContentConsentVersion: REGISTRATION_CONTENT_CONSENT_VERSION,
      },
    });

    await setSession({ kind: "promoter", promoterId: promoter.id, email: promoter.email });
    return redirectTo("/promoter/welcome");
  } catch (e) {
    console.error("[registerHost]", e);
    return redirectTo("/register/promoter?error=unavailable");
  }
}
