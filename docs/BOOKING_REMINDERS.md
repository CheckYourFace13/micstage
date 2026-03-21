# Booking reminder emails

MicStage sends optional **email** reminders for upcoming performer bookings at roughly **24 hours** and **2 hours** before slot start (venue-local time, same semantics as booking).

## Requirements

- **PostgreSQL** + `DATABASE_URL`
- **Resend** (same as password reset): `RESEND_API_KEY`, `EMAIL_FROM` (verified domain in production)
- **Public app URL** for links: `APP_URL` or `NEXT_PUBLIC_APP_URL`

## Cron / scheduler

Call the job on a fixed interval (e.g. every **30 minutes**). Vercel: `vercel.json` includes a sample cron hitting `/api/cron/booking-reminders`.

**Authentication** (required in production):

```http
Authorization: Bearer <CRON_SECRET>
```

Alternative header: `x-micstage-cron-secret: <CRON_SECRET>`

Set **`CRON_SECRET`** (or **`MICSTAGE_CRON_SECRET`**) to a long random string. Vercel Cron can use the same secret in project env vars.

**Disable without removing the route:**

```bash
MICSTAGE_DISABLE_BOOKING_REMINDERS=1
```

**Manual test (local):**

```bash
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/booking-reminders
```

## Idempotency & safety

- `Booking.reminderEmail24hSentAt` / `reminderEmail2hSentAt` prevent duplicate sends.
- Cancelled bookings (`cancelledAt`) and cancelled instances (`EventInstance.isCancelled`) are excluded; a post-claim re-check clears the timestamp if state changed.
- No recipient email (no musician email and no `performerEmail`) → skip, no claim.
- Send failures clear the claim so a later run can retry.

## Non-Vercel cron

Use GitHub Actions, `cron` on a server, or a worker product with the same HTTP request + secret. The handler supports **GET** and **POST**.
