-- CreateTable
CREATE TABLE "GrowthDiscoveryRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "markets" TEXT[],
    "createdLeads" INTEGER NOT NULL,
    "duplicateLeads" INTEGER NOT NULL,
    "skippedLeads" INTEGER NOT NULL,
    "candidatesTotal" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,

    CONSTRAINT "GrowthDiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrowthDiscoveryRun_createdAt_idx" ON "GrowthDiscoveryRun"("createdAt");
