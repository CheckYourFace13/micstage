"use server";

import bcrypt from "bcryptjs";
import tzLookup from "tz-lookup";
import { requirePrisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { setSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { consumeRateLimit } from "@/lib/rateLimit";
import { JOINED_VENUE, PRODUCT_ANALYTICS_QS } from "@/lib/productAnalytics";

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

function reqFloat(formData: FormData, key: string): number {
  const v = reqString(formData, key);
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) throw new Error(`${key} must be a number`);
  return n;
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

  const venueName = reqString(formData, "venueName");
  const googlePlaceId = reqString(formData, "googlePlaceId");
  const formattedAddress = reqString(formData, "formattedAddress");
  const city = optString(formData, "city");
  const region = optString(formData, "region");
  const country = optString(formData, "country");
  const lat = reqFloat(formData, "lat");
  const lng = reqFloat(formData, "lng");
  if (!googlePlaceId) throw new Error("Pick your venue from Google suggestions");
  if (!venueName) throw new Error("Venue name must come from Google selection");

  const timeZone = tzLookup(lat, lng);

  const passwordHash = await bcrypt.hash(password, 12);

  const baseSlug = slugify(venueName) || "venue";
  let slug = baseSlug;
  for (let i = 0; i < 25; i++) {
    const exists = await requirePrisma().venue.findUnique({ where: { slug } });
    if (!exists) break;
    slug = `${baseSlug}-${i + 2}`;
  }

  await requirePrisma().$transaction(async (tx) => {
    const existing = await tx.venueOwner.findUnique({ where: { email } });
    if (existing) {
      const ok = await bcrypt.compare(password, existing.passwordHash);
      if (!ok) redirect("/login/venue?error=invalid");
    }
    const owner = existing ?? (await tx.venueOwner.create({ data: { email, passwordHash } }));

    // If the owner already existed, we leave their passwordHash as-is (login flow comes next).
    await tx.venue.create({
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

    await setSession({ kind: "venue", venueOwnerId: owner.id, email: owner.email });
  });

  redirect(`/venue?${PRODUCT_ANALYTICS_QS.joined}=${JOINED_VENUE}`);
}

