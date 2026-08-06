#!/bin/sh
# Copy-paste into Hostinger hPanel → Advanced → Cron Jobs (separate jobs).
# Replace YOUR_CRON_SECRET with the same value as CRON_SECRET on the server.

SECRET="YOUR_CRON_SECRET"
BASE="https://micstage.com"

# --- Job 1: every 15 min — mine venue emails + claim invites + outreach ---
# Schedule: */15 * * * *
curl -fsS -m 360 -X POST \
  -H "Authorization: Bearer $SECRET" \
  "$BASE/api/cron/growth-pipeline?phase=tick"

# --- Job 2: every 30 min — nationwide discovery + publish/verify/promote ---
# Schedule: */30 * * * *
# curl -fsS -m 300 -X POST \
#   -H "Authorization: Bearer $SECRET" \
#   "$BASE/api/cron/growth-pipeline?phase=discovery"

# --- Job 3: daily 06:10 UTC — IndexNow for new resource guides ---
# Schedule: 10 6 * * *
# curl -fsS -m 60 -X POST -H "Authorization: Bearer $SECRET" \
#   "$BASE/api/cron/seo-content-engine"

# --- Job 4: weekly Sunday 06:00 UTC — IndexNow sitemap + Bing ping ---
# Schedule: 0 6 * * 0
# curl -fsS -m 120 -X POST -H "Authorization: Bearer $SECRET" \
#   "$BASE/api/cron/seo-index-ping"
