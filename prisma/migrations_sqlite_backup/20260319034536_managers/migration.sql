-- CreateTable
CREATE TABLE "VenueManager" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "VenueManagerAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venueId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MANAGER',
    CONSTRAINT "VenueManagerAccess_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VenueManagerAccess_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "VenueManager" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VenueManager_email_key" ON "VenueManager"("email");

-- CreateIndex
CREATE INDEX "VenueManagerAccess_managerId_idx" ON "VenueManagerAccess"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "VenueManagerAccess_venueId_managerId_key" ON "VenueManagerAccess"("venueId", "managerId");
