-- Marketing outreach tracking + webhook idempotency

ALTER TYPE "MarketingEventType" ADD VALUE IF NOT EXISTS 'EMAIL_DELIVERED';
ALTER TYPE "MarketingEventType" ADD VALUE IF NOT EXISTS 'EMAIL_BOUNCED';
ALTER TYPE "MarketingEventType" ADD VALUE IF NOT EXISTS 'EMAIL_COMPLAINED';
ALTER TYPE "MarketingEventType" ADD VALUE IF NOT EXISTS 'EMAIL_CLICKED';

ALTER TABLE "MarketingEmailSend" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "MarketingEmailSend" ADD COLUMN IF NOT EXISTS "bouncedAt" TIMESTAMP(3);
ALTER TABLE "MarketingEmailSend" ADD COLUMN IF NOT EXISTS "complainedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "MarketingOutreachClick" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sendId" TEXT NOT NULL,
    "contactId" TEXT,
    "destinationUrl" TEXT NOT NULL,
    CONSTRAINT "MarketingOutreachClick_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketingOutreachClick_sendId_key" ON "MarketingOutreachClick"("sendId");
CREATE INDEX IF NOT EXISTS "MarketingOutreachClick_createdAt_idx" ON "MarketingOutreachClick"("createdAt");
CREATE INDEX IF NOT EXISTS "MarketingOutreachClick_contactId_idx" ON "MarketingOutreachClick"("contactId");

ALTER TABLE "MarketingOutreachClick" DROP CONSTRAINT IF EXISTS "MarketingOutreachClick_sendId_fkey";
ALTER TABLE "MarketingOutreachClick" ADD CONSTRAINT "MarketingOutreachClick_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "MarketingEmailSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "MarketingProviderWebhookEvent_provider_externalId_key" ON "MarketingProviderWebhookEvent"("provider", "externalId");
