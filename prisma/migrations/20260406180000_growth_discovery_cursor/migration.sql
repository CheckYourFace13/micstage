-- Autonomous discovery pagination (per adapter + market)
CREATE TABLE "GrowthDiscoveryCursor" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "adapterId" TEXT NOT NULL,
    "marketSlug" TEXT NOT NULL,
    "cursorKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "GrowthDiscoveryCursor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrowthDiscoveryCursor_adapterId_marketSlug_cursorKey_key" ON "GrowthDiscoveryCursor"("adapterId", "marketSlug", "cursorKey");

CREATE INDEX "GrowthDiscoveryCursor_adapterId_marketSlug_idx" ON "GrowthDiscoveryCursor"("adapterId", "marketSlug");
