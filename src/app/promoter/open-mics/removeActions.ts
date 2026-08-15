"use server";

import { redirect } from "next/navigation";
import { getPromoterSessionOrNull, getVenueSessionOrNull } from "@/lib/authz";
import { requirePrisma } from "@/lib/prisma";
import {
  assertPromoterCanRemoveListing,
  assertVenueOwnerCanRemoveListing,
  OPEN_MIC_REMOVAL_REASON,
  removeOpenMicListing,
} from "@/lib/publicListings/openMicSelfRemoval";

export async function removeOpenMicAsPromoterAction(formData: FormData) {
  const session = await getPromoterSessionOrNull();
  if (!session || session.kind !== "promoter") {
    redirect("/login/promoter?next=/promoter");
  }

  const listingSlug = String(formData.get("listingSlug") || "").trim();
  if (!listingSlug) redirect("/promoter?promoter=remove_invalid");

  const prisma = requirePrisma();
  const auth = await assertPromoterCanRemoveListing(prisma, session.promoterId, listingSlug);
  if (!auth.ok) {
    redirect(auth.error === "forbidden" ? "/promoter?promoter=forbidden" : "/promoter?promoter=remove_missing");
  }

  const result = await removeOpenMicListing({
    prisma,
    listingId: auth.listingId,
    actor: { kind: "promoter", promoterId: session.promoterId },
    reasonCode: OPEN_MIC_REMOVAL_REASON.PROMOTER,
  });

  if (!result.ok) {
    redirect("/promoter?promoter=remove_error");
  }

  redirect(`/promoter/open-mics/${encodeURIComponent(listingSlug)}/removed`);
}

export async function removeOpenMicAsVenueOwnerAction(formData: FormData) {
  const session = await getVenueSessionOrNull();
  if (!session || session.kind !== "venue" || !session.venueOwnerId) {
    redirect("/login/venue?next=/venue");
  }

  const listingSlug = String(formData.get("listingSlug") || "").trim();
  if (!listingSlug) redirect("/venue?notice=remove_invalid");

  const prisma = requirePrisma();
  const auth = await assertVenueOwnerCanRemoveListing(prisma, session.venueOwnerId, listingSlug);
  if (!auth.ok) {
    redirect("/venue?notice=remove_forbidden");
  }

  const result = await removeOpenMicListing({
    prisma,
    listingId: auth.listingId,
    actor: { kind: "venue_owner", venueOwnerId: session.venueOwnerId },
    reasonCode: OPEN_MIC_REMOVAL_REASON.VENUE_OWNER,
  });

  if (!result.ok) {
    redirect("/venue?notice=remove_error");
  }

  redirect(`/promoter/open-mics/${encodeURIComponent(listingSlug)}/removed?as=venue`);
}
