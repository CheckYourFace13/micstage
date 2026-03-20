# First steps to go live (do these in order)

## 1. Copy and fill environment variables

1. Copy `.env.example` → `.env.local` (never commit `.env.local`).
2. Set at minimum:
   - **`AUTH_SECRET`** — long random string (32+ characters).
   - **`APP_URL`** — your real public URL with `https://`, e.g. `https://micstage.com`.
   - **`NEXT_PUBLIC_APP_URL`** — same as `APP_URL` in production.

## 2. Run the env checker

```bash
npm run check:env
```

Before your **final** production deploy:

```bash
npm run check:env:production
```

Fix anything it reports as `FAIL`. Address `WARN` items before real users rely on the app.

## 3. Email (password resets)

Without this, **production** password reset will error when sending mail.

1. Create a [Resend](https://resend.com) account and API key → **`RESEND_API_KEY`**.
2. Verify your domain in Resend and set **`EMAIL_FROM`** to an address on that domain  
   (e.g. `MicStage <no-reply@micstage.com>`).

## 4. Database (production)

- **SQLite (`file:…`)** is fine for local dev only.
- For production, use **Postgres** (e.g. Neon, Supabase, RDS, or local `docker-compose.postgres.yml` to practice).

**Note:** This repo’s Prisma schema is currently **`provider = "sqlite"`**. Pointing `DATABASE_URL` at Postgres without switching the provider and migrations will **not** work. Treat “move to Postgres” as a dedicated cutover (see `docs/go-live-checklist.md`). Until then, production-style hosts expect Postgres — plan the migration before heavy traffic.

Practice DB with Docker: `docker compose -f docker-compose.postgres.yml up -d`  
Example URL: `postgresql://postgres:postgres@localhost:5432/openmic`

## 5. After deploy

1. Open **`/api/health`** — should return `"ok": true` and `"database": "up"`.
2. Add uptime monitoring on **`/api/health`** (or your host’s health feature).
3. **Google Search Console** — verify domain, submit `https://YOUR_DOMAIN/sitemap.xml`.

## 6. Optional but recommended

- Error monitoring (e.g. Sentry).
- Analytics (if you add trackers, plan cookie consent where required).

Full detail: **`docs/go-live-checklist.md`**.
