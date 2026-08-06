-- Discovery single-flight lease + safe invocation source log (no secrets).

CREATE TABLE IF NOT EXISTS "DiscoveryExecutionGuard" (
    "id" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lockedByRequestId" TEXT,
    "lastCompletedAt" TIMESTAMP(3),
    "lastCompletedRunId" TEXT,
    "lastCompletedHourBucket" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscoveryExecutionGuard_pkey" PRIMARY KEY ("id")
);

INSERT INTO "DiscoveryExecutionGuard" ("id", "updatedAt")
VALUES ('growth-discovery', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "DiscoveryInvocationLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "host" TEXT,
    "userAgent" TEXT,
    "sourceIpRedacted" TEXT,
    "xffPresent" BOOLEAN NOT NULL DEFAULT false,
    "xffHopCount" INTEGER NOT NULL DEFAULT 0,
    "authorizationPassed" BOOLEAN NOT NULL,
    "possibleRetryOfRequestId" TEXT,
    "outcome" TEXT NOT NULL,
    "growthDiscoveryRunId" TEXT,
    "hourBucket" TEXT NOT NULL,
    "durationMs" INTEGER,
    CONSTRAINT "DiscoveryInvocationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DiscoveryInvocationLog_createdAt_idx" ON "DiscoveryInvocationLog"("createdAt");
CREATE INDEX IF NOT EXISTS "DiscoveryInvocationLog_hourBucket_idx" ON "DiscoveryInvocationLog"("hourBucket");
CREATE INDEX IF NOT EXISTS "DiscoveryInvocationLog_requestId_idx" ON "DiscoveryInvocationLog"("requestId");
