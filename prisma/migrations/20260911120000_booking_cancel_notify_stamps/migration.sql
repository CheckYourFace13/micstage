-- Idempotent cancel/removal notification stamps on Booking.

ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "cancelNotifyPerformerSentAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "cancelNotifyOrganizerSentAt" TIMESTAMP(3);
