# MicStage

Open mic scheduling, venue discovery, and performer search.

## Launch readiness

1. Follow **[docs/FIRST_STEPS_LAUNCH.md](./docs/FIRST_STEPS_LAUNCH.md)**.
2. Run **`npm run check:env`** (and **`npm run check:env:production`** before final deploy).
3. Full checklist: **[docs/go-live-checklist.md](./docs/go-live-checklist.md)**.

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Local development |
| `npm run build` / `npm start` | Production build & server |
| `npm run check:env` | Validate `.env` / `.env.local` basics |
| `npm run check:env:production` | Stricter checks (Resend, email from-address, DB hints) |

## Health check

- **`GET /api/health`** — JSON `{ ok, database }` for uptime monitors (no secrets).

## Local Postgres (optional practice)

```bash
docker compose -f docker-compose.postgres.yml up -d
```

Default DB: `postgresql://postgres:postgres@localhost:5432/openmic`  
**Note:** The Prisma schema is still configured for SQLite until you complete a Postgres cutover.
