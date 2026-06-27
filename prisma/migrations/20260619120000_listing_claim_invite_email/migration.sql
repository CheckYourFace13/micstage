-- AlterTable
ALTER TABLE "PublicOpenMicListing" ADD COLUMN "claimInviteEmailSentAt" TIMESTAMP(3);
ALTER TABLE "PublicOpenMicListing" ADD COLUMN "claimInviteEmail" TEXT;
ALTER TABLE "PublicOpenMicListing" ADD COLUMN "promotionEligibleAt" TIMESTAMP(3);
