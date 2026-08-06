/**
 * Clear claimInviteEmailSentAt so production canary can re-send after revoke.
 * Preserves claimInviteProviderMessageId and claimInviteEmail until new send overwrites.
 * Does not touch tokens, claims, contacts, or suppressions.
 *
 * Usage:
 *   npx tsx scripts/clear-claim-invite-stamp-for-corrected-resend.mjs --slug=...
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

const slug = arg("--slug");
if (!slug) {
  console.error(JSON.stringify({ ok: false, error: "missing_slug" }));
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
          claimInviteEmailSentAt: true,
          claimInviteProviderMessageId: true,
          claimInviteEmail: true,
        },
      });
      if (!listing) {
        console.log(JSON.stringify({ ok: false, error: "listing_not_found" }));
        process.exitCode = 1;
        return;
      }

      const active = await prisma.listingClaimInviteToken.count({
        where: { listingId: listing.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
      });
      if (active > 0) {
        console.log(JSON.stringify({ ok: false, error: "active_token_exists", active }));
        process.exitCode = 1;
        return;
      }

      if (!listing.claimInviteEmailSentAt) {
        console.log(
          JSON.stringify({
            ok: true,
            listingSlug: listing.slug,
            alreadyCleared: true,
            providerIdPreserved: Boolean(listing.claimInviteProviderMessageId),
          }),
        );
        return;
      }

      const audit = await prisma.listingClaimAuditEvent.create({
        data: {
          listingId: listing.id,
          eventType: "CLAIM_INVITE_CORRECTED_RESEND_PREP",
          meta: {
            reason: "PRE_FIX_RSC_TOKEN_EXPOSURE_CORRECTED_RESEND",
            priorClaimInviteEmailSentAt: listing.claimInviteEmailSentAt.toISOString(),
            priorProviderMessageIdPreserved: listing.claimInviteProviderMessageId,
            clearedField: "claimInviteEmailSentAt",
            preservedFields: ["claimInviteProviderMessageId", "claimInviteEmail"],
          },
        },
      });

      await prisma.publicOpenMicListing.update({
        where: { id: listing.id },
        data: { claimInviteEmailSentAt: null },
      });

      console.log(
        JSON.stringify({
          ok: true,
          listingSlug: listing.slug,
          clearedClaimInviteEmailSentAt: true,
          providerIdPreserved: Boolean(listing.claimInviteProviderMessageId),
          auditEventId: audit.id,
        }),
      );
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
