-- AlterEnum
ALTER TYPE "VenuePerformanceFormat" ADD VALUE 'COMEDY';
ALTER TYPE "VenuePerformanceFormat" ADD VALUE 'SPOKEN_WORD';

UPDATE "EventTemplate" SET "performanceFormat" = 'COMEDY' WHERE "performanceFormat" = 'COMEDY_SPOKEN_WORD';
UPDATE "Venue" SET "performanceFormat" = 'COMEDY' WHERE "performanceFormat" = 'COMEDY_SPOKEN_WORD';
