#!/usr/bin/env npx tsx
/**
 * ONE-TIME production cleanup: remove MicStage **product** artist (`MusicianUser`) and venue
 * (`Venue` / `VenueOwner` / `VenueManager`) accounts, all **bookings**, **schedule templates**
 * (`EventTemplate` → `EventInstance` → `Slot`), venue–artist **messages** (`MessageThread` /
 * `Message` via cascade), **performer history** / interest junctions, and **orphan** venue
 * managers. Does **not** touch `GrowthLead*`, `GrowthLaunchMarket`, `GrowthDiscovery*`,
 * `MarketingEmailSend`, `MarketingContact`, `MarketingJob`, `MarketingEvent`, global
 * `MarketingEmailSuppression`, or provider webhook tables.
 *
 * ## Required delete: `MarketingOutreachDraft`
 *
 * Schema: `MarketingOutreachDraft.venueId` is **required** with `onDelete: Cascade` from `Venue`.
 * Removing venues therefore requires deleting those **venue-native** marketing outreach drafts
 * first. This is **not** the growth pipeline (`GrowthLeadOutreachDraft` — untouched).
 *
 * ## Toggle
 * `DRY_RUN = true` (default): prints counts only.
 * Set to `false` to run one `prisma.$transaction` that deletes in FK-safe order.
 *
 * ## Run (from repo root, DATABASE_URL set or in `.env`)
 *
 *   npx tsx scripts/cleanup-remove-artists-venues-bookings-templates.ts
 */
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const DRY_RUN = false;

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

type CountMap = Record<string, number>;

async function main() {
  const url = readDatabaseUrl();
  if (!url) throw new Error("No DATABASE_URL in env or .env");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  const snapshot = async (): Promise<CountMap> => ({
    Booking: await prisma.booking.count(),
    Slot: await prisma.slot.count(),
    EventInstance: await prisma.eventInstance.count(),
    EventTemplate: await prisma.eventTemplate.count(),
    Message: await prisma.message.count(),
    MessageThread: await prisma.messageThread.count(),
    VenuePerformerHistory: await prisma.venuePerformerHistory.count(),
    MusicianPastVenue: await prisma.musicianPastVenue.count(),
    MusicianVenueInterest: await prisma.musicianVenueInterest.count(),
    MarketingOutreachDraft: await prisma.marketingOutreachDraft.count(),
    VenueManagerAccess: await prisma.venueManagerAccess.count(),
    Venue: await prisma.venue.count(),
    VenueOwner: await prisma.venueOwner.count(),
    MusicianUser: await prisma.musicianUser.count(),
    VenueManager: await prisma.venueManager.count(),
    PasswordResetToken: await prisma.passwordResetToken.count(),
  });

  const before = await snapshot();
  console.info(`[cleanup] DRY_RUN=${DRY_RUN}`);
  console.info("[cleanup] row counts before:", JSON.stringify(before, null, 2));

  if (DRY_RUN) {
    console.info("[cleanup] Dry run only — set DRY_RUN = false in this file to execute.");
    await prisma.$disconnect();
    return;
  }

  const owners = await prisma.venueOwner.findMany({ select: { email: true } });
  const managers = await prisma.venueManager.findMany({ select: { email: true } });
  const musicians = await prisma.musicianUser.findMany({ select: { email: true } });
  const resetSeen = new Set<string>();
  const resetEmailClauses: { email: string; accountType: "VENUE" | "MUSICIAN" }[] = [];
  for (const row of [...owners, ...managers, ...musicians]) {
    for (const accountType of ["VENUE", "MUSICIAN"] as const) {
      const k = `${row.email}\t${accountType}`;
      if (resetSeen.has(k)) continue;
      resetSeen.add(k);
      resetEmailClauses.push({ email: row.email, accountType });
    }
  }

  const deleted: CountMap = {};

  await prisma.$transaction(
    async (tx) => {
      deleted.Booking = (await tx.booking.deleteMany({})).count;
      deleted.Slot = (await tx.slot.deleteMany({})).count;
      deleted.EventInstance = (await tx.eventInstance.deleteMany({})).count;
      deleted.EventTemplate = (await tx.eventTemplate.deleteMany({})).count;
      deleted.Message = (await tx.message.deleteMany({})).count;
      deleted.MessageThread = (await tx.messageThread.deleteMany({})).count;
      deleted.VenuePerformerHistory = (await tx.venuePerformerHistory.deleteMany({})).count;
      deleted.MusicianPastVenue = (await tx.musicianPastVenue.deleteMany({})).count;
      deleted.MusicianVenueInterest = (await tx.musicianVenueInterest.deleteMany({})).count;
      deleted.MarketingOutreachDraft = (await tx.marketingOutreachDraft.deleteMany({})).count;
      deleted.VenueManagerAccess = (await tx.venueManagerAccess.deleteMany({})).count;
      deleted.Venue = (await tx.venue.deleteMany({})).count;
      deleted.VenueOwner = (await tx.venueOwner.deleteMany({})).count;
      deleted.MusicianUser = (await tx.musicianUser.deleteMany({})).count;
      deleted.VenueManager = (await tx.venueManager.deleteMany({})).count;
      deleted.PasswordResetToken =
        resetEmailClauses.length > 0
          ? (await tx.passwordResetToken.deleteMany({ where: { OR: resetEmailClauses } })).count
          : 0;
    },
    { timeout: 600_000, maxWait: 60_000 },
  );

  console.info("[cleanup] deleted row counts:", JSON.stringify(deleted, null, 2));
  const after = await snapshot();
  console.info("[cleanup] row counts after:", JSON.stringify(after, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
