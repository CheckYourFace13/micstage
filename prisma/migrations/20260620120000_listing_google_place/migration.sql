-- Google Business Profile / Places match for public listing quality.
ALTER TABLE "PublicOpenMicListing" ADD COLUMN "googlePlaceId" TEXT;
ALTER TABLE "PublicOpenMicListing" ADD COLUMN "googlePlaceVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "PublicOpenMicListing_googlePlaceId_key" ON "PublicOpenMicListing"("googlePlaceId");
