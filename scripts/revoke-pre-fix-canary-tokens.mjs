/**
 * Revoke specific pre-fix canary tokens. Does not delete rows or alter listings.
 *
 *   npx tsx scripts/revoke-pre-fix-canary-tokens.mjs
 */
import { createRequire } from "node:module";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: true });
loadEnv({ path: ".env" });

const TOKEN_IDS = ["cmsh3he0g0001l555lg0kvbyb", "cmsh3urmi00012355qdgrkb5u"];
const REASON = "PRE_FIX_RSC_TOKEN_EXPOSURE";

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
    const results = [];
    for (const id of TOKEN_IDS) {
      const before = await prisma.listingClaimInviteToken.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          revokedAt: true,
          listingId: true,
          listing: { select: { slug: true, claimInviteProviderMessageId: true, claimInviteEmailSentAt: true } },
        },
      });
      if (!before) {
        results.push({ id, ok: false, error: "not_found" });
        continue;
      }
      const updated = await prisma.listingClaimInviteToken.update({
        where: { id },
        data: {
          status: "REVOKED",
          revokedAt: before.revokedAt ?? new Date(),
        },
        select: { id: true, status: true, revokedAt: true, listingId: true },
      });
      const audit = await prisma.listingClaimAuditEvent.create({
        data: {
          listingId: before.listingId,
          eventType: "CLAIM_INVITE_TOKEN_REVOKED",
          meta: {
            tokenId: id,
            reason: REASON,
            priorStatus: before.status,
            preservedProviderMessageId: before.listing.claimInviteProviderMessageId,
            preservedClaimInviteEmailSentAt: before.listing.claimInviteEmailSentAt,
            listingUnchanged: true,
          },
        },
        select: { id: true },
      });
      results.push({
        ok: true,
        tokenId: updated.id,
        listingSlug: before.listing.slug,
        status: updated.status,
        revokedAt: updated.revokedAt,
        auditEventId: audit.id,
        reason: REASON,
        listingInviteStampPreserved: Boolean(before.listing.claimInviteEmailSentAt),
        providerIdPreserved: Boolean(before.listing.claimInviteProviderMessageId),
      });
    }
    console.log(JSON.stringify({ ok: results.every((r) => r.ok), results }, null, 2));
    process.exitCode = results.every((r) => r.ok) ? 0 : 1;
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
