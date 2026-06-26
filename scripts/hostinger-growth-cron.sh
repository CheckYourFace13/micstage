#!/bin/sh
# Copy-paste into Hostinger hPanel → Advanced → Cron Jobs.
# Replace YOUR_CRON_SECRET with the same value as CRON_SECRET on the server.

SECRET="YOUR_CRON_SECRET"
BASE="https://micstage.com"

# Every 15 min: mine venue emails + draft/send outreach (one HTTP call).
curl -fsS -m 360 -X POST \
  -H "Authorization: Bearer $SECRET" \
  "$BASE/api/cron/growth-pipeline?phase=tick"

# Hourly at :05 UTC: nationwide venue discovery (separate cron job in hPanel).
# curl -fsS -m 300 -X POST \
#   -H "Authorization: Bearer $SECRET" \
#   "$BASE/api/cron/growth-pipeline?phase=discovery"

# Daily 06:10 UTC: ping IndexNow for new resource guides published that day.
# curl -fsS -m 60 -X POST -H "Authorization: Bearer $SECRET" "$BASE/api/cron/seo-content-engine"

# Weekly Sunday 06:00 UTC: IndexNow full sitemap + Bing sitemap ping.
# curl -fsS -m 120 -X POST -H "Authorization: Bearer $SECRET" "$BASE/api/cron/seo-index-ping"
