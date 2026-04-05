-- CreateEnum
CREATE TYPE "GrowthLaunchMarketStatus" AS ENUM ('ACTIVE', 'QUEUED', 'PAUSED');
-- CreateTable
CREATE TABLE "GrowthLaunchMarket" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "discoveryMarketSlug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "regionDefault" TEXT,
    "status" "GrowthLaunchMarketStatus" NOT NULL DEFAULT 'QUEUED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "activatedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "coldApprovalRelaxed" BOOLEAN NOT NULL DEFAULT false,
    "autoExpansionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    CONSTRAINT "GrowthLaunchMarket_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "GrowthLaunchMarket_discoveryMarketSlug_key" ON "GrowthLaunchMarket"("discoveryMarketSlug");
-- CreateIndex
CREATE INDEX "GrowthLaunchMarket_status_sortOrder_idx" ON "GrowthLaunchMarket"("status", "sortOrder");
-- Seed: Chicagoland is the initial active launch market (add more rows via admin).
INSERT INTO "GrowthLaunchMarket" (
    "id",
    "createdAt",
    "updatedAt",
    "discoveryMarketSlug",
    "label",
    "regionDefault",
    "status",
    "sortOrder",
    "coldApprovalRelaxed",
    "autoExpansionEnabled"
) VALUES (
    'growth_launch_seed_chicagoland',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'chicagoland-il',
    'Chicagoland',
    'IL',
    'ACTIVE',
    0,
    false,
    true
)
ON CONFLICT ("discoveryMarketSlug") DO NOTHING;
