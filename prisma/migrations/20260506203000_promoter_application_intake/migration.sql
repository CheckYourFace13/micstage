-- Promoter application intake + email-review token workflow.
CREATE TYPE "PromoterApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "PromoterReviewAction" AS ENUM ('APPROVE', 'REJECT');

CREATE TABLE "PromoterApplication" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "PromoterApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cityRegion" TEXT,
    "brandName" TEXT,
    "socialUrl" TEXT,
    "notes" TEXT,

    CONSTRAINT "PromoterApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromoterApplicationReviewToken" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "action" "PromoterReviewAction" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,

    CONSTRAINT "PromoterApplicationReviewToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoterApplicationReviewToken_tokenHash_key" ON "PromoterApplicationReviewToken"("tokenHash");
CREATE INDEX "PromoterApplication_status_createdAt_idx" ON "PromoterApplication"("status", "createdAt");
CREATE INDEX "PromoterApplication_email_createdAt_idx" ON "PromoterApplication"("email", "createdAt");
CREATE INDEX "PromoterApplicationReviewToken_applicationId_usedAt_idx" ON "PromoterApplicationReviewToken"("applicationId", "usedAt");
CREATE INDEX "PromoterApplicationReviewToken_expiresAt_idx" ON "PromoterApplicationReviewToken"("expiresAt");

ALTER TABLE "PromoterApplicationReviewToken" ADD CONSTRAINT "PromoterApplicationReviewToken_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "PromoterApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
