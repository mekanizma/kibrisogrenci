# Production deploy — Coolify + Supabase (cloud)

## Already done (by agent)
- Supabase project `kibrisogrenci` created (`gglvjbajtthsczofgjdz`, eu-west-1)
- Extensions: postgis, unaccent, pg_trgm, pgcrypto
- Schema + RLS + security RPCs + storage buckets
- Seed: 7 universities (6 verified), 3 packages, FX rates
- Repo pushed to https://github.com/mekanizma/kibrisogrenci

## You still need (cannot be automated without your dashboard login)

### 1) Service role key → Coolify
Open: https://supabase.com/dashboard/project/gglvjbajtthsczofgjdz/settings/api  
Copy **service_role** → set `SUPABASE_SECRET_KEY` in Coolify (and in local `coolify.env`).

Use values from `.env.example` for the rest.

### 2) Auth URL configuration
Open: https://supabase.com/dashboard/project/gglvjbajtthsczofgjdz/auth/url-configuration  
- Site URL: `https://kibrisogrenci.com`  
- Redirect URLs: `https://kibrisogrenci.com/**`  
(Optional local: `http://localhost:3000/**`)

### 3) First admin
1. Deploy / open site → Sign up with your email  
2. Run `supabase/scripts/make_admin.sql` (replace YOUR_EMAIL) in SQL Editor  
3. User → App Metadata: `{ "role": "admin" }` → re-login

### 4) Coolify
- Docker Compose from GitHub `mekanizma/kibrisogrenci`
- Domain → `web`
- Paste env from `.env.example` (+ service_role)
- Ensure build args include `NEXT_PUBLIC_*`

### 5) Optional
- Replace `public/logo.svg` / `hero.jpg` with real assets  
- `BANK_IBAN`  
- WhatsApp tokens when ready
