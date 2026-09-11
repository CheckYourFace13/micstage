-- Append-only booking occupancy history (non-destructive).
-- Active Booking remains 1:1 with Slot; cancelled/replaced occupants are snapshotted here.

CREATE TABLE IF NOT EXISTS "BookingHistory" (
  "id" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "slotId" TEXT NOT NULL,
  "bookingId" TEXT,
  "musicianId" TEXT,
  "performerName" TEXT NOT NULL,
  "performerEmail" TEXT,
  "notes" TEXT,
  "bookedAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  CONSTRAINT "BookingHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BookingHistory_slotId_recordedAt_idx" ON "BookingHistory"("slotId", "recordedAt");
CREATE INDEX IF NOT EXISTS "BookingHistory_bookingId_idx" ON "BookingHistory"("bookingId");
CREATE INDEX IF NOT EXISTS "BookingHistory_performerEmail_recordedAt_idx" ON "BookingHistory"("performerEmail", "recordedAt");

DO $$ BEGIN
  ALTER TABLE "BookingHistory"
    ADD CONSTRAINT "BookingHistory_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "BookingHistory" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "BookingHistory" FROM anon, authenticated;
