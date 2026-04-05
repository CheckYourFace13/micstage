"use server";

import bcrypt from "bcryptjs";
import tzLookup from "tz-lookup";
import { isNextRedirectError } from "@/lib/nextRedirect";
import { getPrismaOrNull } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { setSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { consumeRateLimit } from "@/lib/rateLimit";
import { JOINED_VENUE, PRODUCT_ANALYTICS_QS } from "@/lib/productAnalytics";
import { sendVenueWelcomeEmailAfterRegistration } from "@/lib/marketing/venueWelcomeSend";
import {
  REGISTRATION_CONTENT_CONSENT_VERSION,
  registrationContentConsentChecked,
} from "@/lib/registrationConsent";

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

export async function registerVenue(formData: FormData) {
  const email = reqString(formData, "email").toLowerCase();
  const password = reqString(formData, "password");

  const rl = await consumeRateLimit({
    scope: "register:venue",
    identifier: email,
    limit: 6,
    windowSec: 60 * 60,
  });
  if (!rl.allowed) redirect("/register/venue?error=rate");

  const venueName = optString(formData, "venueName");
  const googlePlaceId = optString(formData, "googlePlaceId");
  const formattedAddress = optString(formData, "formattedAddress");
  const city = optString(formData, "city");
  const region = optString(formData, "region");
  const country = optString(formData, "country");
  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");
  const lat =
    typeof latRaw === "string" && latRaw.trim() ? Number.parseFloat(latRaw.trim()) : Number.NaN;
  const lng =
    typeof lngRaw === "string" && lngRaw.trim() ? Number.parseFloat(lngRaw.trim()) : Number.NaN;

  if (!googlePlaceId || !venueName || !formattedAddress || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    redirect("/register/venue?error=place");
  }

  if (!registrationContentConsentChecked(formData)) {
    redirect("/register/venue?error=consent");
  }

  const timeZone = tzLookup(lat, lng);

  const passwordHash = await bcrypt.hash(password, 12);

  const prisma = getPrismaOrNull();
  if (!prisma) {
    console.error("[registerVenue] database not configured");
    redirect("/register/venue?error=unavailable");
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
        if (!ok) redirect("/login/venue?error=invalid");
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

      // If the owner already existed, we leave their passwordHash as-is (login flow comes next).
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
      await sendVenueWelcomeEmailAfterRegistration(prisma, newVenueId, email);
    }

    redirect(`/venue?${PRODUCT_ANALYTICS_QS.joined}=${JOINED_VENUE}`);
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    console.error("[registerVenue]", e);
    redirect("/register/venue?error=unavailable");
  }
}

