-- Growth lead outreach: support 3-step sequence (one draft row per send).
ALTER TABLE "GrowthLeadOutreachDraft" ADD COLUMN "sequenceStep" INTEGER NOT NULL DEFAULT 1;
