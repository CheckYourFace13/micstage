# SEO: IndexNow, content engine, search

## Wording

Site copy and metadata now say **open mic night platform** explicitly (not stage sound / theater micing). Wrong GSC queries like “how to mic a stage” should fade as Google re-crawls.

## IndexNow + Bing (automated)

Set on Hostinger:

```bash
INDEXNOW_API_KEY=micstage-indexnow-8f3c2a1b9e4d   # any UUID-like string you choose
```

After deploy, verify: `https://micstage.com/{your-key}.txt` returns the key.

**Hostinger cron — weekly** (e.g. Sunday `0 6 * * *`):

```bash
curl -fsS -m 120 -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" "https://micstage.com/api/cron/seo-index-ping"
```

Pings **IndexNow** (Bing, Yandex, etc.) with all sitemap URLs and **Bing sitemap ping**.

**Google:** Google deprecated automatic sitemap ping (2023). There is no reliable server-side “autoping” without Search Console OAuth. Keep sitemap in GSC + request indexing on priority URLs.

## Content engine

New guides live in `src/lib/seo/contentEngine/scheduledArticles.ts`. They publish when `publishedAt` ≤ today (UTC) and appear under `/resources/...`.

**Daily cron** (e.g. `10 6 * * *`) pings IndexNow for guides published that day:

```bash
curl -fsS -m 60 -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" "https://micstage.com/api/cron/seo-content-engine"
```

To add a guide: copy an article block in `scheduledArticles.ts`, set `publishedAt`, push, deploy. Cron pings search engines on publish day.

## Priority URLs to request in Search Console

After deploy, request indexing for new guides:

- `/resources/open-mics-tonight-near-me`
- `/resources/how-to-find-open-mic-nights-near-you`
- `/resources/list-your-open-mic-venue-on-micstage`
