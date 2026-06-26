# Growth pipeline (venue & artist outreach)

MicStage outreach runs when production cron endpoints are called on a schedule. **Recommended setup: two Hostinger cron jobs** (GitHub Actions often gets 403 from Hostinger CDN).

## What drives signups

1. **Email mining** — scrapes contact pages for venue emails (~9k backlog in `SOCIAL_PAYLOAD_RENDER` queue).
2. **Draft + send automation** — creates outreach emails and sends them.
3. **Discovery** — finds new venue leads nationwide via Brave/Serp web search.
4. **Registration** — emails link to `/register/venue?growthLead=…` and `/register/musician?growthLead=…`.

## One cron call (recommended)

Use **`?phase=tick`** — mines emails, creates drafts, and sends outreach in a single request:

```bash
curl -fsS -m 360 -X POST \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://micstage.com/api/cron/growth-pipeline?phase=tick"
```

Schedule **every 15 minutes** in Hostinger hPanel. See `scripts/hostinger-growth-cron.sh` for copy-paste.

Discovery (nationwide venue search) — **every 30 minutes** recommended (`*/30 * * * *` at minute `5` and `35`):

```bash
curl -fsS -m 300 -X POST \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://micstage.com/api/cron/growth-pipeline?phase=discovery"
```

## Volume tuning (more venues + more emails)

After the first Chicago scrape, **most new URLs are duplicates** — that is normal. To keep net-new leads and outreach high:

| Knob | Suggested production value |
|------|---------------------------|
| `MARKETING_CAP_DAILY_OUTREACH` | `100` |
| `GROWTH_OUTREACH_DAILY_MAX` | `100` |
| `GROWTH_OUTREACH_SENDS_PER_CRON_RUN` | `20` |
| `GROWTH_OUTREACH_MAX_SENDS_PER_MARKET_PER_DAY` | `25` |
| `GROWTH_DISCOVERY_AUTONOMOUS_SEARCH_CALLS_PER_RUN` | `20` |
| `GROWTH_SERPAPI_DAILY_MAX` | `24` |
| `GROWTH_BRAVE_SEARCH_API_KEY` | required when Serp quota is low |

Email mining now **prioritizes venue websites** over Instagram/Facebook in the queue (social URLs rarely yield emails).

Run `node scripts/diagnose-growth-outreach.mjs` (with `DATABASE_URL`) to see pending emails, drafts, and sends today.

## Required production env

```bash
CRON_SECRET=...
GROWTH_LEAD_DISCOVERY_CRON_ENABLED=true
GROWTH_AUTO_DRAFT_CRON_ENABLED=true
GROWTH_DISCOVERY_AUTONOMOUS_ENABLED=true
RESEND_API_KEY=...
EMAIL_FROM=MicStage <no-reply@micstage.com>
```

Throughput (defaults raised in code):

```bash
MARKETING_SOCIAL_PAYLOAD_BATCH_PER_CRON=50   # emails mined per tick
GROWTH_OUTREACH_SENDS_PER_CRON_RUN=15
GROWTH_OUTREACH_DAILY_MAX=50
GROWTH_OUTREACH_ALLOW_MEDIUM_CONFIDENCE=true
```

**Nationwide discovery** — put national first (update Hostinger if you still have Midwest-only list):

```bash
GROWTH_DISCOVERY_MARKET_SLUGS=national-discovery-us,chicagoland-il,illinois-regional,central-illinois-il
```

National web search always runs even if omitted from that list.

## Hostinger hPanel (hands-off)

1. **Advanced → Cron Jobs → Add**
2. Schedule: `*/15 * * * *`
3. Command: paste from `scripts/hostinger-growth-cron.sh` with your secret
4. Second job: `5 * * * *` with the discovery `curl` line

If the panel cannot send `Authorization` headers, use **Windows Task Scheduler** with `scripts/run-production-crons.ps1` every 15 minutes instead.

## GitHub Actions

Scheduled GitHub workflows are **disabled** — Hostinger CDN returns **403** to GitHub datacenter IPs. Use **hPanel cron** (above). Workflows remain available for manual `workflow_dispatch` testing only.

## Diagnose low volume

```bash
node scripts/diagnose-growth-outreach.mjs
```

Common blockers:

- Pending email-mining jobs (check `nonEmailVenuePathsQueued` in tick response)
- Daily send cap reached (`sentTodayUtc` vs `effectiveDailyMax`)
- Leads missing email or confidence tier

## Phase reference

| Phase | What it does |
|-------|----------------|
| `tick` | Email mining batch + draft/create + send (use every 15 min) |
| `discovery` | Nationwide/regional venue discovery (hourly) |
| `outreach` | Draft/create + send only (no mining) |
| `all` | Everything — may 504 on Hostinger; avoid |
