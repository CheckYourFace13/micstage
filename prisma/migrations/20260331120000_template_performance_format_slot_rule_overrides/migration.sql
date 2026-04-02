-- Template-level performance format (copied from venue for existing rows).
ALTER TABLE "EventTemplate" ADD COLUMN "performanceFormat" "VenuePerformanceFormat" NOT NULL DEFAULT 'OPEN_VARIETY';

UPDATE "EventTemplate" AS et
SET "performanceFormat" = v."performanceFormat"
FROM "Venue" AS v
WHERE et."venueId" = v.id;

-- Optional per-slot booking rule overrides (null = inherit template).
ALTER TABLE "Slot" ADD COLUMN "bookingRestrictionModeOverride" "BookingRestrictionMode",
ADD COLUMN "restrictionHoursBeforeOverride" INTEGER,
ADD COLUMN "onPremiseMaxDistanceMetersOverride" INTEGER;
