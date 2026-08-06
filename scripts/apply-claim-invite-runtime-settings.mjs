/**
 * Apply OperationalRuntimeSetting migration + set production claim-invite runtime values.
 *
 *   npx tsx scripts/apply-claim-invite-runtime-settings.mjs
 */
import { createRequire } from "node:module";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: true });
loadEnv({ path: ".env" });

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
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "OperationalRuntimeSetting" (
        "id" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "key" TEXT NOT NULL,
        "valueType" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "updatedBy" TEXT,
        "reason" TEXT,
        "meta" JSONB,
        CONSTRAINT "OperationalRuntimeSetting_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "OperationalRuntimeSetting_key_key" ON "OperationalRuntimeSetting"("key")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "OperationalRuntimeSetting_updatedAt_idx" ON "OperationalRuntimeSetting"("updatedAt")`,
    );

    const settings = [
      { key: "MICSTAGE_CLAIM_INVITES_ENABLED", valueType: "boolean", value: "true" },
      { key: "LISTING_CLAIM_INVITES_PER_CRON", valueType: "integer", value: "2" },
      { key: "MICSTAGE_CLAIM_INVITES_DAILY_MAX", valueType: "integer", value: "10" },
      { key: "MICSTAGE_KILL_CLAIM_INVITES", valueType: "boolean", value: "false" },
      { key: "GROWTH_OUTREACH_SENDS_PER_CRON_RUN", valueType: "integer", value: "0" },
    ];

    for (const s of settings) {
      await prisma.operationalRuntimeSetting.upsert({
        where: { key: s.key },
        create: {
          key: s.key,
          valueType: s.valueType,
          value: s.value,
          updatedBy: "apply-claim-invite-runtime-settings.mjs",
          reason: "production_db_backed_activation",
          meta: { source: "local_ops_script" },
        },
        update: {
          valueType: s.valueType,
          value: s.value,
          updatedBy: "apply-claim-invite-runtime-settings.mjs",
          reason: "production_db_backed_activation",
          meta: { source: "local_ops_script" },
        },
      });
    }

    const rows = await prisma.operationalRuntimeSetting.findMany({
      where: {
        key: {
          in: [
            "MICSTAGE_CLAIM_INVITES_ENABLED",
            "LISTING_CLAIM_INVITES_PER_CRON",
            "MICSTAGE_CLAIM_INVITES_DAILY_MAX",
            "MICSTAGE_KILL_CLAIM_INVITES",
            "GROWTH_OUTREACH_SENDS_PER_CRON_RUN",
          ],
        },
      },
      select: { key: true, value: true, valueType: true, updatedAt: true, updatedBy: true },
      orderBy: { key: "asc" },
    });

    console.log(JSON.stringify({ ok: true, tableReady: true, rows }, null, 2));
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
