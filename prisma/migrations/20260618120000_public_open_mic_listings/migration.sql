-- CreateEnum
CREATE TYPE "PublicListingVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'NEEDS_REVIEW', 'OUTDATED');

-- CreateEnum
CREATE TYPE "PublicListingClaimStatus" AS ENUM ('UNCLAIMED', 'CLAIM_PENDING', 'CLAIMED');

-- CreateEnum
CREATE TYPE "ListingClaimRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ListingCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "OpenMicDemandRequestKind" AS ENUM ('REQUEST_CITY', 'REMINDER_NEARBY', 'ADD_VENUE', 'REQUEST_VENUE', 'PERFORM_HERE');

-- CreateEnum
CREATE TYPE "OpenMicDemandRequestStatus" AS ENUM ('NEW', 'REVIEWED', 'CLOSED');

-- CreateTable
CREATE TABLE "PublicOpenMicListing" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "formattedAddress" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "websiteUrl" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "tiktokUrl" TEXT,
    "youtubeUrl" TEXT,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationStatus" "PublicListingVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "claimStatus" "PublicListingClaimStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "claimedVenueId" TEXT,
    "growthLeadId" TEXT,
    "about" TEXT,
    "hostName" TEXT,
    "signupMethod" TEXT,
    "cost" TEXT,
    "ageRestriction" TEXT,
    "equipmentNotes" TEXT,
    "accessibilityNotes" TEXT,
    "internalNotes" TEXT,

    CONSTRAINT "PublicOpenMicListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicOpenMicSchedule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listingId" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "startTimeMin" INTEGER NOT NULL,
    "endTimeMin" INTEGER NOT NULL,
    "timeZone" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "performanceFormat" "VenuePerformanceFormat" NOT NULL DEFAULT 'OPEN_VARIETY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "signupMethod" TEXT,
    "sourceUrl" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "PublicOpenMicSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingClaimRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listingId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "proofUrl" TEXT,
    "notes" TEXT,
    "desiredLoginEmail" TEXT,
    "status" "ListingClaimRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByEmail" TEXT,
    "reviewNotes" TEXT,

    CONSTRAINT "ListingClaimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingCorrection" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listingId" TEXT NOT NULL,
    "reporterEmail" TEXT,
    "reporterName" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ListingCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByEmail" TEXT,
    "reviewNotes" TEXT,

    CONSTRAINT "ListingCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenMicDemandRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "kind" "OpenMicDemandRequestKind" NOT NULL,
    "status" "OpenMicDemandRequestStatus" NOT NULL DEFAULT 'NEW',
    "email" TEXT,
    "name" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "venueName" TEXT,
    "listingSlug" TEXT,
    "message" TEXT,
    "growthLeadId" TEXT,

    CONSTRAINT "OpenMicDemandRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicOpenMicListing_slug_key" ON "PublicOpenMicListing"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PublicOpenMicListing_claimedVenueId_key" ON "PublicOpenMicListing"("claimedVenueId");

-- CreateIndex
CREATE INDEX "PublicOpenMicListing_city_region_idx" ON "PublicOpenMicListing"("city", "region");

-- CreateIndex
CREATE INDEX "PublicOpenMicListing_verificationStatus_claimStatus_idx" ON "PublicOpenMicListing"("verificationStatus", "claimStatus");

-- CreateIndex
CREATE INDEX "PublicOpenMicListing_lastVerifiedAt_idx" ON "PublicOpenMicListing"("lastVerifiedAt");

-- CreateIndex
CREATE INDEX "PublicOpenMicSchedule_listingId_weekday_idx" ON "PublicOpenMicSchedule"("listingId", "weekday");

-- CreateIndex
CREATE INDEX "ListingClaimRequest_listingId_status_idx" ON "ListingClaimRequest"("listingId", "status");

-- CreateIndex
CREATE INDEX "ListingClaimRequest_status_createdAt_idx" ON "ListingClaimRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ListingCorrection_listingId_status_idx" ON "ListingCorrection"("listingId", "status");

-- CreateIndex
CREATE INDEX "ListingCorrection_status_createdAt_idx" ON "ListingCorrection"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OpenMicDemandRequest_kind_status_idx" ON "OpenMicDemandRequest"("kind", "status");

-- CreateIndex
CREATE INDEX "OpenMicDemandRequest_createdAt_idx" ON "OpenMicDemandRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "PublicOpenMicListing" ADD CONSTRAINT "PublicOpenMicListing_claimedVenueId_fkey" FOREIGN KEY ("claimedVenueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicOpenMicListing" ADD CONSTRAINT "PublicOpenMicListing_growthLeadId_fkey" FOREIGN KEY ("growthLeadId") REFERENCES "GrowthLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicOpenMicSchedule" ADD CONSTRAINT "PublicOpenMicSchedule_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "PublicOpenMicListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingClaimRequest" ADD CONSTRAINT "ListingClaimRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "PublicOpenMicListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingCorrection" ADD CONSTRAINT "ListingCorrection_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "PublicOpenMicListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMicDemandRequest" ADD CONSTRAINT "OpenMicDemandRequest_growthLeadId_fkey" FOREIGN KEY ("growthLeadId") REFERENCES "GrowthLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
