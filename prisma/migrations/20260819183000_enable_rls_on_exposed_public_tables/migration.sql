-- MicStage: enable Row Level Security on all public application tables.
--
-- Root cause: Prisma migrate CREATE TABLE does not enable RLS. Supabase exposes
-- public schema via PostgREST to anon/authenticated roles, so tables without RLS
-- are flagged as rls_disabled_in_public (ERROR).
--
-- Access model: MicStage reads/writes exclusively via Prisma on DIRECT_URL (postgres
-- role, bypasses RLS). No Supabase JS client queries exist in the app. Therefore:
--   - ENABLE ROW LEVEL SECURITY on every application table
--   - REVOKE ALL from anon, authenticated (defense in depth vs PostgREST grants)
--   - NO permissive USING (true) policies
--
-- rls_enabled_no_policy INFO findings for server-only tables are expected and safe.

-- Future Prisma-created tables: revoke default anon/authenticated table privileges.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

DO $$
DECLARE
  tbl text;
  app_tables text[] := ARRAY[
    'VenueOwner',
    'PromoterApplication',
    'PromoterUser',
    'PromoterSeries',
    'PromoterVenueAccess',
    'PromoterNight',
    'PromoterApplicationReviewToken',
    'Venue',
    'VenueManager',
    'VenueManagerAccess',
    'MusicianUser',
    'VenuePerformerHistory',
    'MusicianPastVenue',
    'MusicianVenueInterest',
    'EventTemplate',
    'EventInstance',
    'Slot',
    'Booking',
    'MessageThread',
    'Message',
    'PasswordResetToken',
    'AuthRateLimitCounter',
    'MarketingEvent',
    'MarketingJob',
    'MarketingContact',
    'MarketingOutreachDraft',
    'MarketingEmailSend',
    'MarketingOutreachClick',
    'MarketingProviderWebhookEvent',
    'MarketingEmailSuppression',
    'GrowthLead',
    'GrowthDiscoveryCursor',
    'OperationalRuntimeSetting',
    'GrowthDiscoveryRun',
    'DiscoveryExecutionGuard',
    'DiscoveryInvocationLog',
    'GrowthLeadOutreachDraft',
    'GrowthLeadResponse',
    'GrowthLeadFollowUpSchedule',
    'GrowthLaunchMarket',
    'PublicOpenMicListing',
    'PublicOpenMicSchedule',
    'ListingClaimRequest',
    'ListingClaimInviteToken',
    'ListingClaimAuditEvent',
    'ListingOpenMicEvidence',
    'ListingCorrection',
    'OpenMicDemandRequest',
    '_prisma_migrations'
  ];
BEGIN
  FOREACH tbl IN ARRAY app_tables
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = tbl
        AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', tbl);
    END IF;
  END LOOP;
END $$;

-- Outreach auto-ramp stays capped at 25/day until post-deploy verification sets this to clear.
INSERT INTO "OperationalRuntimeSetting" (
  "id",
  "createdAt",
  "updatedAt",
  "key",
  "valueType",
  "value",
  "updatedBy",
  "reason"
)
VALUES (
  'clrlsgate00000000000000001',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'DATABASE_RLS_SECURITY_GATE',
  'string',
  'pending_verification',
  'enable_rls_on_exposed_public_tables',
  'Outreach auto-ramp capped at 25/day until Security Advisor + anon-access verification sets clear'
)
ON CONFLICT ("key") DO UPDATE SET
  "value" = EXCLUDED."value",
  "valueType" = EXCLUDED."valueType",
  "updatedBy" = EXCLUDED."updatedBy",
  "reason" = EXCLUDED."reason",
  "updatedAt" = CURRENT_TIMESTAMP;
