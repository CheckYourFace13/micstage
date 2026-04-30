import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import tzLookup from "tz-lookup";
import { advanceGrowthLeadAcquisitionStage } from "@/lib/growth/growthLeadAcquisitionStage";
import { getPrismaOrNull } from "@/lib/prisma";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { slugify } from "@/lib/slug";
import { setSession } from "@/lib/session";
import { consumeRateLimit } from "@/lib/rateLimit";
import { JOINED_VENUE, PRODUCT_ANALYTICS_QS } from "@/lib/productAnalytics";
import { sendVenueSignupThankYouEmailIfNeeded } from "@/lib/venueSignupThankYouEmail";
import {
  REGISTRATION_CONTENT_CONSENT_VERSION,
  registrationContentConsentChecked,
} from "@/lib/registrationConsent";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";

export const runtime = "nodejs";

class RedirectSignal extends Error {
  readonly path: string;
  constructor(path: string) {
    super(path);
    this.path = path;
  }
}

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

  const rl = await consumeRateLimit({
    scope: "register:venue",
    identifier: email,
    limit: 6,
    windowSec: 60 * 60,
  });
  if (!rl.allowed) return redirectTo("/register/venue?error=rate");

  const venueName = optString(formData, "venueName");
  const googlePlaceId = optString(formData, "googlePlaceId");
  const formattedAddress = optString(formData, "formattedAddress");
  const city = optString(formData, "city");
  const region = optString(formData, "region");
  const country = optString(formData, "country");
  const growthTraceLeadId = optString(formData, "growthTraceLeadId");
  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");
  const lat =
    typeof latRaw === "string" && latRaw.trim() ? Number.parseFloat(latRaw.trim()) : Number.NaN;
  const lng =
    typeof lngRaw === "string" && lngRaw.trim() ? Number.parseFloat(lngRaw.trim()) : Number.NaN;

  if (!googlePlaceId || !venueName || !formattedAddress || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return redirectTo("/register/venue?error=place");
  }

  if (!registrationContentConsentChecked(formData)) {
    return redirectTo("/register/venue?error=consent");
  }

  const timeZone = tzLookup(lat, lng);
  const passwordHash = await bcrypt.hash(password, 12);

  const prisma = getPrismaOrNull();
  if (!prisma) {
    console.error("[registerVenue] database not configured");
    return redirectTo("/register/venue?error=unavailable");
  }

  try {
    const baseSlug = slugify(venueName) || "venue";
    let slug = baseSlug;
    for (let i = 0; i < 25; i++) {
      const exists = await prisma.venue.findUnique({ where: { slug } });
      if (!exists) break;
      slug = `${baseSlug}-${i + 2}`;
    }

    let newVenueId: string | null = null;
    const consentAt = new Date();
    const consentVer = REGISTRATION_CONTENT_CONSENT_VERSION;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.venueOwner.findUnique({ where: { email } });
      let owner;
      if (existing) {
        const ok = await bcrypt.compare(password, existing.passwordHash);
        if (!ok) throw new RedirectSignal("/login/venue?error=invalid");
        owner = await tx.venueOwner.update({
          where: { id: existing.id },
          data: {
            registrationContentConsentAt: consentAt,
            registrationContentConsentVersion: consentVer,
          },
        });
      } else {
        owner = await tx.venueOwner.create({
          data: {
            email,
            passwordHash,
            registrationContentConsentAt: consentAt,
            registrationContentConsentVersion: consentVer,
          },
        });
      }

      const created = await tx.venue.create({
        data: {
          ownerId: owner.id,
          name: venueName,
          slug,
          googlePlaceId,
          formattedAddress,
          city,
          region,
          country,
          lat,
          lng,
          timeZone,
        },
      });
      newVenueId = created.id;

      await setSession({ kind: "venue", venueOwnerId: owner.id, email: owner.email });
    });

    if (newVenueId) {
      await sendVenueSignupThankYouEmailIfNeeded(prisma, newVenueId, email);
    }

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

    return redirectTo(`/venue?${PRODUCT_ANALYTICS_QS.joined}=${JOINED_VENUE}`);
  } catch (e) {
    if (e instanceof RedirectSignal) return redirectTo(e.path);
    console.error("[registerVenue]", e);
    return redirectTo("/register/venue?error=unavailable");
  }
}

