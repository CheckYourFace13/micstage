# Growth pipeline (venue & artist outreach)

MicStage does **not** run outreach on its own. Production must call HTTP cron endpoints on a schedule (Hostinger hPanel, GitHub Actions, or cron-job.org).

## What drives signups

1. **Discovery** — finds venue/artist leads (`GROWTH_LEAD_DISCOVERY_CRON_ENABLED=true`).
2. **Draft + send automation** — creates outreach emails and sends them (`GROWTH_AUTO_DRAFT_CRON_ENABLED=true`).
3. **Registration** — emails link to `/register/venue?growthLead=…` and `/register/musician?growthLead=…`.

## Required production env

Set these on Hostinger (or your host) alongside `CRON_SECRET` / `MICSTAGE_CRON_SECRET`:

```bash
GROWTH_LEAD_DISCOVERY_CRON_ENABLED=true
GROWTH_AUTO_DRAFT_CRON_ENABLED=true
RESEND_API_KEY=...
EMAIL_FROM=MicStage <no-reply@micstage.com>
```

Recommended for more throughput (still capped for deliverability):

```bash
GROWTH_OUTREACH_SENDS_PER_CRON_RUN=10
GROWTH_OUTREACH_DAILY_MAX=50
MARKETING_CAP_DAILY_OUTREACH=50
GROWTH_OUTREACH_ALLOW_MEDIUM_CONFIDENCE=true
```

Optional discovery (more leads):

```bash
GROWTH_DISCOVERY_AUTONOMOUS_ENABLED=true
GROWTH_BRAVE_SEARCH_API_KEY=...   # or SERPAPI_KEY
```

## Cron endpoints

| Endpoint | Purpose | Suggested schedule |
|----------|---------|-------------------|
| `POST /api/cron/growth-pipeline` | Discover leads, draft outreach, send invites | Every 30 min |
| `POST /api/cron/booking-reminders` | Booking reminder emails | Hourly |
| `POST /api/cron/marketing-social-payload-render` | Extract emails from venue websites (no inbox) | Every 15–30 min |

Auth (same for all):

```http
Authorization: Bearer <CRON_SECRET>
```

Example:

```bash
curl -fsS -m 360 -X POST \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://micstage.com/api/cron/growth-pipeline"
```

### Hostinger hPanel

Under **Advanced → Cron Jobs**, run the `curl` command above every 30 minutes. If the panel cannot send custom headers, use [GitHub Actions](../.github/workflows/growth-pipeline.yml) or cron-job.org instead.

### GitHub Actions

This repo includes:

- `.github/workflows/growth-pipeline.yml` — every 30 minutes
- `.github/workflows/booking-reminders.yml` — hourly

Add repository secret **`CRON_SECRET`** (same value as production). Enable Actions on the repo.

## Diagnose low volume

On a machine with `DATABASE_URL` (SSH to Hostinger or local `.env`):

```bash
node scripts/diagnose-growth-outreach.mjs
```

Admin dashboard: **`/internal/admin/growth`** — funnel metrics, pending drafts, send errors, email-ready queue.

Common blockers:

| Symptom | Fix |
|---------|-----|
| `draftEnabled: false` in cron JSON | Set `GROWTH_AUTO_DRAFT_CRON_ENABLED=true` and redeploy |
| `discoveryEnabled: false` | Set `GROWTH_LEAD_DISCOVERY_CRON_ENABLED=true` |
| Cron returns 401 | Set `CRON_SECRET` on server; match scheduler header |
| Sends stay at ~3/day | Raise `GROWTH_OUTREACH_SENDS_PER_CRON_RUN`; run cron more often |
| Many leads, few sends | Most emails may be LOW confidence — import better data or set `GROWTH_OUTREACH_ALLOW_MEDIUM_CONFIDENCE=true` |
| APPROVED drafts with `lastError` | Fix Resend domain / `EMAIL_FROM`; run `npx tsx scripts/retry-failed-growth-outreach.ts` |

## Manual recovery

```bash
npx tsx scripts/retry-failed-growth-outreach.ts
npx tsx scripts/run-growth-cycle-report.ts   # one discovery + draft/send cycle (uses env flags)
```
