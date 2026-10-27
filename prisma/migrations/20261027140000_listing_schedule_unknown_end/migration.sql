-- Unknown official end times stay unknown. No placeholder duration.
ALTER TABLE "PublicOpenMicSchedule" ALTER COLUMN "endTimeMin" DROP NOT NULL;
