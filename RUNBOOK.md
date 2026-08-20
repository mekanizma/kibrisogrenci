# Runbook — kibrisogrenci.com

## Deploy (Coolify, from GitHub)
1. Push repo to GitHub (`mekanizma/kibrisogrenci`).
2. In Coolify create a **Docker Compose** resource from the repo (`docker-compose.yml`).
3. Attach the existing **Supabase** service; set env vars from `.env.example`.
4. Point domain `kibrisogrenci.com` at the `web` service via Coolify's proxy (TLS auto).

## Database migrations
- `supabase db push` with `SUPABASE_DB_URL`, OR paste `supabase/migrations/0001_init.sql` then `0002_seed.sql` into the Supabase SQL Editor in order.
- Verify RLS: `select tablename,rowsecurity from pg_tables where schemaname='public' and rowsecurity=false;` (must return 0 rows).

## Backups (no managed backups on self-hosted)
- Nightly `pg_dump -Fc` + WAL archiving where feasible; encrypt with `BACKUP_ENCRYPTION_KEY`; upload off-site (`BACKUP_S3_*`).
- Retention: 7 daily, 4 weekly, 6 monthly. Separate nightly backup of Storage buckets.

## Tested restore procedure (a backup never restored is not a backup)
1. Create scratch DB: `createdb ko_restore_test`.
2. `pg_restore --clean --no-owner -d ko_restore_test latest.dump`.
3. Run smoke queries: counts on `listings`, `universities`, `audit_log`.
4. Point a staging web instance at the scratch DB; load home + a listing page.
5. Record result in `system_health`. **Monthly restore-drill checklist** — tick each step above.

## Incident: SMTP down
- Canary (every 15 min) writes `system_health`; two consecutive failures raise an alert. Registration halts silently otherwise — check the admin System Health panel first.

## Incident: FX API down
- Worker keeps serving last known rate with timestamp; never blocks the site; records failure in `system_health`.
