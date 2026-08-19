-- Enable RLS on HostNightVenueDispute (created by 20260819213000 without RLS).
-- Server-only via Prisma; no permissive policies.

ALTER TABLE public."HostNightVenueDispute" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."HostNightVenueDispute" FROM anon, authenticated;
