import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { linkRegistrationToGrowthLead } from "@/lib/growth/linkRegistrationToGrowthLead";
import { stampRegistrationSubmitForLead } from "@/lib/growth/stampRegistrationSubmitForLead";
import { getPrismaOrNull } from "@/lib/prisma";
import { setSession } from "@/lib/session";
import { consumeRateLimit } from "@/lib/rateLimit";
import { JOINED_VENUE, PRODUCT_ANALYTICS_QS } from "@/lib/productAnalytics";
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

function optString(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function redirectTo(path: string) {
  return NextResponse.redirect(absoluteServerRedirectUrl(path));
}

function registerErrorPath(code: string, email?: string, claimListing?: string, growthTraceLeadId?: string) {
  const qs = new URLSearchParams();
  qs.set("error", code);
  if (email) qs.set("email", email);
  if (claimListing) qs.set("claimListing", claimListing);
  if (growthTraceLeadId) qs.set("growthLead", growthTraceLeadId);
  return `/register/venue?${qs.toString()}`;
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/register/venue?error=unavailable");
  }

  let email: string;
  let password: string;
  try {
    email = reqString(formData, "email").toLowerCase();
    password = reqString(formData, "password");
  } catch {
    return redirectTo("/register/venue?error=unavailable");
  }

  const growthTraceLeadId = optString(formData, "growthTraceLeadId");
  const claimListing = optString(formData, "claimListing");

  // Genuine form POST receipt — stamp before consent / rate-limit / duplicate / create.
  const prisma = getPrismaOrNull();
  if (prisma) {
    await stampRegistrationSubmitForLead(prisma, {
      leadType: "VENUE",
      growthTraceLeadId,
      registrationEmail: email,
    });
  }

  const rl = await consumeRateLimit({
    scope: "register:venue",
    identifier: email,
    limit: 6,
    windowSec: 60 * 60,
  });
  if (!rl.allowed) return redirectTo(registerErrorPath("rate", email, claimListing, growthTraceLeadId));

  if (!registrationContentConsentChecked(formData)) {
    return redirectTo(registerErrorPath("consent", email, claimListing, growthTraceLeadId));
  }

  const passwordHash = await bcrypt.hash(password, 12);

  if (!prisma) {
    console.error("[registerVenue] database not configured");
    return redirectTo(registerErrorPath("unavailable", email, claimListing, growthTraceLeadId));
  }

  try {
    // Managers sign in through the same venue login, so a duplicate here would shadow their account.
    const [existing, existingManager] = await Promise.all([
      prisma.venueOwner.findUnique({ where: { email }, select: { id: true } }),
      prisma.venueManager.findUnique({ where: { email }, select: { id: true } }),
    ]);
    if (existing || existingManager) {
      return redirectTo(registerErrorPath("exists", email, claimListing, growthTraceLeadId));
    }

    const consentAt = new Date();
    const consentVer = REGISTRATION_CONTENT_CONSENT_VERSION;

    const owner = await prisma.venueOwner.create({
      data: {
        email,
        passwordHash,
        registrationContentConsentAt: consentAt,
        registrationContentConsentVersion: consentVer,
      },
    });

    await setSession({ kind: "venue", venueOwnerId: owner.id, email: owner.email });

    const linked = await linkRegistrationToGrowthLead(prisma, {
      leadType: "VENUE",
      growthTraceLeadId,
      registrationEmail: email,
    });

    const setupQs = new URLSearchParams();
    setupQs.set(PRODUCT_ANALYTICS_QS.joined, JOINED_VENUE);
    if (linked.linkedLeadId || growthTraceLeadId) {
      setupQs.set("growthLead", linked.linkedLeadId || growthTraceLeadId!);
    }
    if (claimListing) setupQs.set("claimListing", claimListing);
    return redirectTo(`/venue/setup?${setupQs.toString()}`);
  } catch (e) {
    console.error("[registerVenue]", e);
    return redirectTo(registerErrorPath("unavailable", email, claimListing, growthTraceLeadId));
  }
}
