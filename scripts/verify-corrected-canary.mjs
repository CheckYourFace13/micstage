/**
 * Post-send security + isolation verification for a corrected canary.
 * Does not log raw tokens or full emails.
 *
 *   npx tsx scripts/verify-corrected-canary.mjs \
 *     --slug=... --old-token-id=... --new-token-id=...
 */
import { createRequire } from "node:module";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: true });
loadEnv({ path: ".env" });

function arg(name) {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

function redact(email) {
  if (!email || !email.includes("@")) return "[redacted]";
  const [u, d] = email.split("@");
  const dh = d.split(".")[0] || d;
  return `${u[0] || "*"}***@${dh.slice(0, 2)}***.${d.split(".").slice(1).join(".") || "*"}`;
}

const slug = arg("--slug");
const oldTokenId = arg("--old-token-id");
const newTokenId = arg("--new-token-id");

if (!slug || !oldTokenId || !newTokenId) {
  console.error(JSON.stringify({ ok: false, error: "missing_args" }));
  process.exitCode = 1;
} else {
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require("../src/generated/prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");

  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url || /127\.0\.0\.1|55432|localhost/.test(url)) {
    console.error(JSON.stringify({ ok: false, error: "refusing_non_production_url" }));
    process.exitCode = 1;
  } else {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

    async function main() {
      const listing = await prisma.publicOpenMicListing.findUnique({
        where: { slug },
        select: {
          id: true,
          slug: true,
          name: true,
          claimStatus: true,
          claimedVenueId: true,
          claimInviteEmailSentAt: true,
          claimInviteProviderMessageId: true,
          claimInviteEmail: true,
          growthLead: { select: { contactEmailNormalized: true } },
        },
      });
      if (!listing) {
        console.log(JSON.stringify({ ok: false, error: "listing_not_found" }));
        process.exitCode = 1;
        return;
      }

      const tokens = await prisma.listingClaimInviteToken.findMany({
        where: { listingId: listing.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          revokedAt: true,
          usedAt: true,
          expiresAt: true,
          createdAt: true,
          tokenHash: true,
        },
      });
      const oldTok = tokens.find((t) => t.id === oldTokenId);
      const newTok = tokens.find((t) => t.id === newTokenId);
      const active = tokens.filter((t) => t.status === "ACTIVE" && t.expiresAt > new Date());

      const openedAny = newTok
        ? await prisma.listingClaimAuditEvent.findFirst({
            where: {
              listingId: listing.id,
              eventType: "CLAIM_INVITE_OPENED",
              createdAt: { gte: newTok.createdAt },
            },
            orderBy: { createdAt: "desc" },
          })
        : null;

      const claims = await prisma.listingClaimRequest.count({ where: { listingId: listing.id } });
      const venueOwners = listing.claimedVenueId
        ? await prisma.venueOwner.count({ where: { venueId: listing.claimedVenueId } })
        : 0;
      const venuesForListing = listing.claimedVenueId
        ? await prisma.venue.findUnique({
            where: { id: listing.claimedVenueId },
            select: { id: true, bookingEnabled: true },
          })
        : null;

      const email = listing.growthLead?.contactEmailNormalized || listing.claimInviteEmail;
      const checks = {
        oldTokenRevoked: oldTok?.status === "REVOKED" && Boolean(oldTok.revokedAt),
        exactlyOneActiveToken: active.length === 1 && active[0]?.id === newTokenId,
        newTokenActive: newTok?.status === "ACTIVE" && !newTok.usedAt,
        providerMessageIdStored: Boolean(listing.claimInviteProviderMessageId),
        inviteStampSet: Boolean(listing.claimInviteEmailSentAt),
        claimInviteOpenedAudit: Boolean(openedAny),
        claimNotConsumed: newTok?.usedAt == null && listing.claimStatus === "UNCLAIMED" && !listing.claimedVenueId,
        noClaimRequestCreated: claims === 0,
        noVenueOwnerFromOpen: venueOwners === 0,
        bookingRemainsOff: !venuesForListing?.bookingEnabled,
        tokenHashStored: Boolean(newTok?.tokenHash),
      };

      const allPass = Object.values(checks).every(Boolean);
      console.log(
        JSON.stringify(
          {
            ok: allPass,
            listingSlug: listing.slug,
            recipientRedacted: email ? redact(email) : null,
            checks,
            tokenSummary: {
              total: tokens.length,
              active: active.length,
              oldStatus: oldTok?.status ?? null,
              newStatus: newTok?.status ?? null,
            },
            openedAuditId: openedAny?.id ?? null,
          },
          null,
          2,
        ),
      );
      process.exitCode = allPass ? 0 : 1;
    }

    main()
      .catch((e) => {
        console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }));
        process.exitCode = 1;
      })
      .finally(async () => {
        await prisma.$disconnect();
      });
  }
}
