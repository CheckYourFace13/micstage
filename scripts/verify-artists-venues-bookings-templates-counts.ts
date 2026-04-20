#!/usr/bin/env npx tsx
/**
 * Read-only: print current row counts for artist/venue/booking/template-related tables
 * after (or before) running `cleanup-remove-artists-venues-bookings-templates.ts`.
 *
 *   npx tsx scripts/verify-artists-venues-bookings-templates-counts.ts
 */
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

function readDatabaseUrl(): string {
  const fromEnv = (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.PRISMA_DATABASE_URL ??
    ""
  ).trim();
  if (fromEnv) return fromEnv;
  if (!fs.existsSync(".env")) return "";
  const envText = fs.readFileSync(".env", "utf8");
  const match = envText.match(/^DATABASE_URL\s*=\s*"?(.*?)"?\s*$/m);
  return (match?.[1] ?? "").trim();
}

async function main() {
  const url = readDatabaseUrl();
  if (!url) throw new Error("No DATABASE_URL in env or .env");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  try {
    const counts = {
      MusicianUser: await prisma.musicianUser.count(),
      Venue: await prisma.venue.count(),
      VenueOwner: await prisma.venueOwner.count(),
      VenueManager: await prisma.venueManager.count(),
      VenueManagerAccess: await prisma.venueManagerAccess.count(),
      Booking: await prisma.booking.count(),
      EventTemplate: await prisma.eventTemplate.count(),
      EventInstance: await prisma.eventInstance.count(),
      Slot: await prisma.slot.count(),
      MessageThread: await prisma.messageThread.count(),
      Message: await prisma.message.count(),
      VenuePerformerHistory: await prisma.venuePerformerHistory.count(),
      MusicianPastVenue: await prisma.musicianPastVenue.count(),
      MusicianVenueInterest: await prisma.musicianVenueInterest.count(),
      MarketingOutreachDraft: await prisma.marketingOutreachDraft.count(),
    };

    console.info("[verify] row counts:", JSON.stringify(counts, null, 2));
    const gl = await prisma.growthLead.count();
    const sends = await prisma.marketingEmailSend.count();
    const contacts = await prisma.marketingContact.count();
    console.info(
      `[verify] growth + marketing audit (should be unchanged by cleanup): GrowthLead=${gl} MarketingEmailSend=${sends} MarketingContact=${contacts}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
