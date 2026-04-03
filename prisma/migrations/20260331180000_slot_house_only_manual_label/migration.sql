-- AlterEnum
ALTER TYPE "BookingRestrictionMode" ADD VALUE 'HOUSE_ONLY';

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN "manualLineupLabel" TEXT;
