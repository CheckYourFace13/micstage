-- Durable Places usage ledger. Additive only.
CREATE TABLE IF NOT EXISTS "PlacesUsageLedger" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dayUtc" TEXT NOT NULL,
  "monthUtc" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "queryKeyHash" TEXT,
  "placeId" TEXT,
  "fieldMask" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "sent" BOOLEAN NOT NULL DEFAULT false,
  "dedupeHit" BOOLEAN NOT NULL DEFAULT false,
  "responseClass" TEXT,
  "estimatedUsdMicros" INTEGER NOT NULL DEFAULT 0,
  "blockedReason" TEXT,
  CONSTRAINT "PlacesUsageLedger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlacesUsageLedger_idempotencyKey_key" ON "PlacesUsageLedger"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "PlacesUsageLedger_monthUtc_sku_sent_idx" ON "PlacesUsageLedger"("monthUtc", "sku", "sent");
CREATE INDEX IF NOT EXISTS "PlacesUsageLedger_dayUtc_sku_sent_idx" ON "PlacesUsageLedger"("dayUtc", "sku", "sent");
CREATE INDEX IF NOT EXISTS "PlacesUsageLedger_placeId_idx" ON "PlacesUsageLedger"("placeId");
