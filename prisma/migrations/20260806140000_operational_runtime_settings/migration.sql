-- Additive: non-secret operational runtime settings for claim-invite gates.
CREATE TABLE IF NOT EXISTS "OperationalRuntimeSetting" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "key" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT,
    "reason" TEXT,
    "meta" JSONB,

    CONSTRAINT "OperationalRuntimeSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OperationalRuntimeSetting_key_key" ON "OperationalRuntimeSetting"("key");
CREATE INDEX IF NOT EXISTS "OperationalRuntimeSetting_updatedAt_idx" ON "OperationalRuntimeSetting"("updatedAt");
