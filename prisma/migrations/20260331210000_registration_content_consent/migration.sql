-- Registration consent (Terms, Privacy, platform promotional/content use) — audit trail on signup.
ALTER TABLE "VenueOwner" ADD COLUMN "registrationContentConsentAt" TIMESTAMP(3);
ALTER TABLE "VenueOwner" ADD COLUMN "registrationContentConsentVersion" TEXT;

ALTER TABLE "MusicianUser" ADD COLUMN "registrationContentConsentAt" TIMESTAMP(3);
ALTER TABLE "MusicianUser" ADD COLUMN "registrationContentConsentVersion" TEXT;
