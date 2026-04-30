-- One-time thank-you email after venue registration (see signupThankYouEmailSentAt).
ALTER TABLE "Venue" ADD COLUMN "signupThankYouEmailSentAt" TIMESTAMP(3);
