-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EventTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "venueId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weekday" TEXT NOT NULL,
    "startTimeMin" INTEGER NOT NULL,
    "endTimeMin" INTEGER NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "slotMinutes" INTEGER NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "bookingRestrictionMode" TEXT NOT NULL DEFAULT 'NONE',
    "restrictionHoursBefore" INTEGER NOT NULL DEFAULT 6,
    "onPremiseMaxDistanceMeters" INTEGER NOT NULL DEFAULT 1000,
    CONSTRAINT "EventTemplate_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EventTemplate" ("breakMinutes", "createdAt", "description", "endTimeMin", "id", "isPublic", "slotMinutes", "startTimeMin", "timeZone", "title", "updatedAt", "venueId", "weekday") SELECT "breakMinutes", "createdAt", "description", "endTimeMin", "id", "isPublic", "slotMinutes", "startTimeMin", "timeZone", "title", "updatedAt", "venueId", "weekday" FROM "EventTemplate";
DROP TABLE "EventTemplate";
ALTER TABLE "new_EventTemplate" RENAME TO "EventTemplate";
CREATE INDEX "EventTemplate_venueId_weekday_idx" ON "EventTemplate"("venueId", "weekday");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
