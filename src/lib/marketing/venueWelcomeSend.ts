import type { PrismaClient } from "@/generated/prisma/client";
import { absoluteUrl } from "@/lib/publicSeo";
import { venueWelcomeEmailEnabled } from "@/lib/marketing/emailConfig";
import { sendThroughMarketingPipeline } from "@/lib/marketing/sendPipeline";
import { MARKETING_TEMPLATE_KINDS } from "@/lib/marketing/templateKinds";
import { computeCitySlugVenueCounts, primaryDiscoverySlugForVenue } from "@/lib/discoveryMarket";

/**
 * Optional auto-send after venue registration (gated by MARKETING_AUTO_VENUE_WELCOME_EMAIL=true).
 * Category marketing; one idempotent send per venue (`purposeKey` includes venueId).
 */
export async function sendVenueWelcomeEmailAfterRegistration(
  prisma: PrismaClient,
  venueId: string,
  ownerEmail: string,
): Promise<void> {
  if (!venueWelcomeEmailEnabled()) return;

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true, slug: true, city: true, region: true },
  });
  if (!venue) return;

  const slices = await prisma.venue.findMany({ where: { city: { not: null } }, select: { city: true, region: true } });
  const counts = computeCitySlugVenueCounts(slices);
  const city = (venue.city ?? "").trim();
  const discoveryMarketSlug =
    city ? primaryDiscoverySlugForVenue(city, venue.region, counts) : null;

  const dashboardUrl = absoluteUrl("/venue");
  const publicUrl = absoluteUrl(`/venues/${venue.slug}`);

  const subject = `Welcome to MicStage — ${venue.name} is live`;
  const text = [
    `Hi,`,
    ``,
    `Thanks for listing ${venue.name} on MicStage.`,
    ``,
    `Venue dashboard: ${dashboardUrl}`,
    `Public page: ${publicUrl}`,
    ``,
    `— MicStage`,
  ].join("\n");
  const html = `<p>Hi,</p><p>Thanks for listing <strong>${escapeHtml(venue.name)}</strong> on MicStage.</p><p><a href="${escapeAttr(dashboardUrl)}">Open your venue dashboard</a></p><p><a href="${escapeAttr(publicUrl)}">View public venue page</a></p><p>— MicStage</p>`;

  await sendThroughMarketingPipeline(prisma, {
    to: ownerEmail,
    category: "marketing",
    templateKind: MARKETING_TEMPLATE_KINDS.VENUE_REGISTRATION_WELCOME,
    purposeKey: `venue-welcome:${venue.id}`,
    subject,
    htmlBody: html,
    textBody: text,
    venueId: venue.id,
    discoveryMarketSlug,
  }).catch((e) => console.error("[venueWelcomeSend]", e));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
