-- New host nights default to 15-minute performances with artists starting every 20 minutes.
-- Does not rewrite existing PromoterNight rows.
ALTER TABLE "PromoterNight" ALTER COLUMN "slotMinutes" SET DEFAULT 15;
ALTER TABLE "PromoterNight" ALTER COLUMN "breakMinutes" SET DEFAULT 5;
