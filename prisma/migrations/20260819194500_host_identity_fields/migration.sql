-- Host public identity (PromoterUser remains internal model name).
ALTER TABLE "PromoterUser" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "PromoterUser" ADD COLUMN IF NOT EXISTS "hostSlug" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "PromoterUser_hostSlug_key" ON "PromoterUser"("hostSlug");
