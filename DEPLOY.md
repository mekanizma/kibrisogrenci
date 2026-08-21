# Production deploy notes — Coolify + Supabase

## Migrations (run once on Supabase SQL editor, in order)
1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_seed.sql`
3. `supabase/migrations/0003_security_hardening.sql`

Verify RLS:
```sql
select tablename from pg_tables where schemaname='public' and not rowsecurity;
```
Must return 0 rows.

## First admin user
1. Sign up via the website.
2. In Supabase SQL:
```sql
update profiles set role = 'admin' where id = '<user-uuid>';
-- and set JWT claim (Auth → Users → user → App Metadata):
-- { "role": "admin" }
```
Or via service role:
```sql
-- after profiles update, refresh session / re-login
```

## Coolify
- Resource type: Docker Compose (`docker-compose.yml`)
- Domain → `web` service
- Set all vars from `.env.example`
- Build args must include `NEXT_PUBLIC_*` (compose already passes them)
