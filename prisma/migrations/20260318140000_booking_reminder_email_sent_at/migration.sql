-- Track outbound booking reminder emails (idempotency; cron-safe).
ALTER TABLE "Booking" ADD COLUMN "reminderEmail24hSentAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "reminderEmail2hSentAt" TIMESTAMP(3);

CREATE INDEX "Booking_cancelledAt_reminderEmail24hSentAt_idx" ON "Booking"("cancelledAt", "reminderEmail24hSentAt");
CREATE INDEX "Booking_cancelledAt_reminderEmail2hSentAt_idx" ON "Booking"("cancelledAt", "reminderEmail2hSentAt");
