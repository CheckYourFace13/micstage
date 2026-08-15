# Free-plan production backup policy (Supabase)

MicStage intentionally stays on **Supabase Free** until production traction justifies Pro.
Free does **not** include automatic backups or PITR.

## What we do instead

Create a **manual logical production backup** (roles + schema + data SQL) and keep it **outside** Supabase.

### Cadence (current stage)

- **Daily** while MicStage is changing rapidly
- **Before any schema migration** (`prisma migrate deploy`)
- **Before bulk cleanup / data transformations**
- Keep **multiple generations** (do not overwrite prior dumps)
- Keep **at least one off-site copy** (OneDrive, Google Drive, or encrypted cloud)

### How to run

```bash
# PowerShell (preferred on Windows with PostgreSQL 17 installed)
$env:PG_DUMP_PATH = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
$env:MICSTAGE_BACKUP_DIR = "$env:USERPROFILE\Projects\OpenMic-private-backups"
.\scripts\create-production-backup.ps1

# Or Node helper
npm run backup:production
npm run backup:validate

# Optional isolated restore check (local temp Postgres only — never production)
node scripts/validate-backup-restore-local.mjs YYYY-MM-DD-HHMM
```

Prefer `supabase db dump` when Docker Desktop is available (matches Supabase docs).  
If Docker is unavailable, the script falls back to local `pg_dump` for the `public` schema (MicStage Prisma app data).

### What is included

- Application tables in `public` (listings, venues, promoters, performers, claims, evidence, growth/discovery, runtime settings, audit events, `_prisma_migrations`, …)
- Roles file when the connection allows; otherwise a documented stub (managed Supabase often blocks cluster role dumps)

### What is not included

- **Supabase Storage objects** — MicStage profile images use **Vercel Blob** when configured, not Supabase Storage. DB dump alone is sufficient for app restore of MicStage data.
- Supabase-managed schemas (`auth`, `storage`, …) are excluded by design for this app-focused backup.

### Launch gate (early stage)

Backup gate **PASS** when:

1. Fresh production logical backup exists  
2. Backup validated (non-zero sizes, expected tables, COPY blocks intact)  
3. Stored outside Supabase (local private folder + recommended off-site copy)  
4. Repeatable script exists  
5. Migration history remains clean  

Paid Supabase automatic backups / PITR are **not** required for GO at this stage.

### When to upgrade Supabase

Once production usage justifies it, upgrade to **Supabase Pro** for managed daily backups. PITR remains optional until risk warrants it.
