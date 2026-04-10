-- CreateEnum
CREATE TYPE "GrowthLeadEmailConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "GrowthLead" ADD COLUMN "contactEmailRaw" TEXT;
ALTER TABLE "GrowthLead" ADD COLUMN "contactEmailConfidence" "GrowthLeadEmailConfidence";
ALTER TABLE "GrowthLead" ADD COLUMN "contactEmailRejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "GrowthLead_contactEmailConfidence_idx" ON "GrowthLead"("contactEmailConfidence");
