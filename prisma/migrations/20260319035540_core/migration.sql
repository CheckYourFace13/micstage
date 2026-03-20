-- CreateTable
CREATE TABLE "MusicianUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "stageName" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "EventTemplate" (
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
    CONSTRAINT "EventTemplate_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "templateId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "startTimeMinOverride" INTEGER,
    "endTimeMinOverride" INTEGER,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "EventInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "instanceId" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    CONSTRAINT "Slot_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "EventInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "slotId" TEXT NOT NULL,
    "musicianId" TEXT,
    "performerName" TEXT NOT NULL,
    "performerEmail" TEXT,
    "notes" TEXT,
    "cancelledAt" DATETIME,
    CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "MusicianUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MusicianUser_email_key" ON "MusicianUser"("email");

-- CreateIndex
CREATE INDEX "EventTemplate_venueId_weekday_idx" ON "EventTemplate"("venueId", "weekday");

-- CreateIndex
CREATE INDEX "EventInstance_date_idx" ON "EventInstance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "EventInstance_templateId_date_key" ON "EventInstance"("templateId", "date");

-- CreateIndex
CREATE INDEX "Slot_instanceId_status_idx" ON "Slot"("instanceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_instanceId_startMin_key" ON "Slot"("instanceId", "startMin");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_slotId_key" ON "Booking"("slotId");

-- CreateIndex
CREATE INDEX "Booking_musicianId_idx" ON "Booking"("musicianId");
