# MicStage Go-Live Checklist

**Start here:** [`docs/FIRST_STEPS_LAUNCH.md`](./FIRST_STEPS_LAUNCH.md) — ordered steps you can do today.

From the repo root, run:

```bash
npm run check:env
npm run check:env:production
```

After deploy, verify **`GET /api/health`** returns `"ok": true`.

Use this full checklist before pointing **micstage.com** (or your domain) at production traffic.

## Are we “automatically on Google” with no extra work?

**No.** The app ships **SEO-friendly** pages (metadata, shareable URLs, `sitemap.xml`, `robots.txt`), but **Google does not guarantee indexing** without:

1. **Google Search Console** — verify domain ownership, submit `https://YOUR_DOMAIN/sitemap.xml`, monitor coverage.
2. **Time** — crawling and ranking are not instant.
3. **Content & links** — quality pages + real-world links/social signals still matter.
4. **Technical** — production `APP_URL` / `NEXT_PUBLIC_APP_URL` must match the live domain so canonical URLs and reset links are correct.

So: you’re **set up to be indexed**, not **done** with marketing/SEO.

---

## 1) Environment

- [ ] `DATABASE_URL` — **Postgres** in production (not SQLite).
- [ ] `AUTH_SECRET` — long random string, unique per environment.
- [ ] `APP_URL` — `https://micstage.com` (or your real domain), **no trailing slash**.
- [ ] `NEXT_PUBLIC_APP_URL` — same as `APP_URL` in production (metadata, client share URLs).
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — restricted by HTTP referrer / domain in Google Cloud.
- [ ] **Email (password resets, transactional)**  
  - [ ] `RESEND_API_KEY`  
  - [ ] `EMAIL_FROM` — e.g. `MicStage <no-reply@micstage.com>`  
  - [ ] **Verify sending domain** in Resend (SPF/DKIM) so mail doesn’t land in spam.  
  - [ ] Optional: dedicated addresses like `support@`, `no-reply@` on your domain for trust.

---

## 2) Database

- [ ] Run migrations on production: `npx prisma migrate deploy`
- [ ] Run `npx prisma generate` in CI/build if needed.
- [ ] Backups + tested restore procedure.

---

## 3) Auth & security

- [ ] Password reset flows tested end-to-end on production URL.
- [ ] Rate limits acceptable for launch (tune if abused).
- [ ] HTTPS only; HSTS / security headers per host (e.g. Vercel defaults).
- [ ] Secrets only in host env — never committed.

---

## 4) SEO & discovery (after deploy)

- [ ] Open **Search Console** → add property → verify.
- [ ] Submit **sitemap**: `https://YOUR_DOMAIN/sitemap.xml`
- [ ] Spot-check `/robots.txt` allows public routes and blocks `/artist`, `/venue`, `/dashboard`, `/logout`.
- [ ] Spot-check a venue page: title, description, readable URL.
- [ ] Optional: **Bing Webmaster Tools**, social preview debugger (Facebook/Twitter/LinkedIn).

---

## 5) Product / UX

- [ ] MicStage header + “Performers” / “Open mic venues” work on mobile.
- [ ] Forms: visible borders and pink focus ring (global CSS).
- [ ] Legal: privacy policy + terms (if you collect emails / run marketing) — **not included in repo**.

---

## 6) Monitoring & ops

- [ ] Error tracking (e.g. Sentry).
- [ ] Uptime check on `/` or health route.
- [ ] Log retention / alerts on 5xx spikes.

---

## 7) Still not in this codebase (common launch gaps)

- [ ] Custom **404** / error branding (optional).
- [ ] **Analytics** (Plausible, GA4, etc.).
- [ ] **Cookie consent** if you add non-essential trackers (EU/UK).
- [ ] **Support inbox** or contact page for venues/artists.
- [ ] **Status page** (optional).

---

## Quick “ready?” summary

| Area            | Ready in code? | You must still do |
|-----------------|----------------|-------------------|
| Sitemap/robots  | Yes            | Submit sitemap in Search Console |
| Meta / OG base  | Yes            | Correct `APP_URL` on prod |
| Reset email     | Code path yes  | Resend + verified `EMAIL_FROM` domain |
| Google indexing | N/A            | Search Console + time + content |
