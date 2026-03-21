# Booking reminder emails

MicStage sends optional **email** reminders for upcoming performer bookings at roughly **24 hours** and **2 hours** before slot start (venue-local time, same semantics as booking).

## Requirements

- **PostgreSQL** + `DATABASE_URL`
- **Resend** (same as password reset): `RESEND_API_KEY`, `EMAIL_FROM` (verified domain in production)
- **Public app URL** for links: `APP_URL` or `NEXT_PUBLIC_APP_URL`

## Production trigger (Hostinger and similar)

**MicStage does not run an internal scheduler.** In production (including **Hostinger**), something **outside** the app must call the HTTP endpoint on a schedule.

**Endpoint:** `GET` or `POST`  
**URL:** `https://<your-production-domain>/api/cron/booking-reminders`

**Authentication (required):** send your shared secret so the route is not public:

```http
Authorization: Bearer <CRON_SECRET>
```

Alternative header (same value):

```http
x-micstage-cron-secret: <CRON_SECRET>
```

Set **`CRON_SECRET`** or **`MICSTAGE_CRON_SECRET`** in your production environment to a long random string. Anyone who knows the URL must not be able to trigger sends without this secret.

**Suggested schedule:** about every **30 minutes** so the ~24h and ~2h time windows are hit reliably.

**Disable without removing the route:**

```bash
MICSTAGE_DISABLE_BOOKING_REMINDERS=1
```

**Manual test (local):**

```bash
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/booking-reminders
```

### Hostinger-friendly option: hPanel Cron Jobs

If your Hostinger plan includes **Cron Jobs** (often under **Advanced** in hPanel):

1. Create a cron that runs every 30 minutes (or hourly), depending on your plan’s minimum interval.
2. Command: use `curl` to hit your live site with the Bearer header. Example (replace domain and secret — **do not** commit the real secret):

```bash
curl -fsS -m 120 -H "Authorization: Bearer YOUR_CRON_SECRET" "https://yourdomain.com/api/cron/booking-reminders"
```

- `-m 120` caps wait time (seconds); increase if your app is slow cold-starting.
- On shared hosting, PHP cron wrappers sometimes exist; the important part is an HTTP GET/POST with the **`Authorization`** header. If the panel only allows a URL ping **without** custom headers, use an external scheduler (below) or a tiny server-side script that adds the header.

### Alternative: external HTTP cron

If the host cannot send custom headers, use a service such as **cron-job.org**, **EasyCron**, or a small **VPS/system cron** that runs the same `curl` command above. The scheduler only needs outbound HTTPS access to your MicStage URL.

### Note on Vercel

If you later deploy on Vercel, you can attach their **Cron Jobs** product to the same path and secret; there is **no** `vercel.json` cron in this repo (Hostinger-oriented setups use external triggers only).

## Idempotency & safety

- `Booking.reminderEmail24hSentAt` / `reminderEmail2hSentAt` prevent duplicate sends.
- Cancelled bookings (`cancelledAt`) and cancelled instances (`EventInstance.isCancelled`) are excluded; a post-claim re-check clears the timestamp if state changed.
- No recipient email (no musician email and no `performerEmail`) → skip, no claim.
- Send failures clear the claim so a later run can retry.
