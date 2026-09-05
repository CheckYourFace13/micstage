import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { getPrismaOrNull } from "@/lib/prisma";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
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

  const prisma = getPrismaOrNull();
  if (!prisma) {
    console.error("[registerVenue] database not configured");
    return redirectTo(registerErrorPath("unavailable", email, claimListing, growthTraceLeadId));
  }

  try {
    const existing = await prisma.venueOwner.findUnique({ where: { email } });
    if (existing) {
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

    if (growthTraceLeadId) {
      const lead = await prisma.growthLead.findFirst({
        where: { id: growthTraceLeadId, leadType: "VENUE" },
        select: { id: true, contactEmailNormalized: true },
      });
      if (lead) {
        await advanceGrowthLeadAcquisitionStage(prisma, lead.id, "ACCOUNT_CREATED", { leadType: "VENUE" });
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

    const setupQs = new URLSearchParams();
    setupQs.set(PRODUCT_ANALYTICS_QS.joined, JOINED_VENUE);
    if (growthTraceLeadId) setupQs.set("growthLead", growthTraceLeadId);
    if (claimListing) setupQs.set("claimListing", claimListing);
    return redirectTo(`/venue/setup?${setupQs.toString()}`);
  } catch (e) {
    console.error("[registerVenue]", e);
    return redirectTo(registerErrorPath("unavailable", email, claimListing, growthTraceLeadId));
  }
}
