-- ===========================================================================
-- 0001_init.sql  — kibrisogrenci.com foundation schema (reversible; see 0001_down.sql)
-- Run with: supabase db push   OR paste into Supabase SQL Editor.
-- ===========================================================================

-- ---- Extensions ----
create extension if not exists postgis;
create extension if not exists unaccent;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ---- Turkish full-text config (falls back to simple + unaccent if absent) ----
do $$
declare has_turkish boolean;
begin
  select exists(select 1 from pg_ts_config where cfgname = 'turkish') into has_turkish;
  if has_turkish then
    raise notice 'Using turkish text search configuration.';
  else
    raise notice 'turkish TS config missing — falling back to simple + unaccent + pg_trgm.';
  end if;
end $$;

-- ---- Enums ----
do $$ begin
  create type user_role as enum ('guest','student','landlord','agency','admin');
exception when duplicate_object then null; end $$;
do $$ begin create type profile_status as enum ('active','suspended'); exception when duplicate_object then null; end $$;
do $$ begin create type verification_status as enum ('unverified','pending','verified','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type property_type as enum ('apartment','studio','room','house'); exception when duplicate_object then null; end $$;
do $$ begin create type price_period as enum ('monthly','weekly'); exception when duplicate_object then null; end $$;
do $$ begin create type gender_pref as enum ('any','male','female'); exception when duplicate_object then null; end $$;
do $$ begin create type listing_status as enum ('draft','pending_review','published','rejected','expired','rented'); exception when duplicate_object then null; end $$;
do $$ begin create type invoice_status as enum ('unpaid','paid','void'); exception when duplicate_object then null; end $$;
do $$ begin create type subscription_status as enum ('active','expired','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type report_status as enum ('open','resolved','dismissed'); exception when duplicate_object then null; end $$;
do $$ begin create type translation_source as enum ('human','machine'); exception when duplicate_object then null; end $$;

-- ---- updated_at trigger fn ----
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

-- ---- profiles (1:1 auth.users) ----
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'student',
  full_name text,
  phone_e164 text,
  phone_verified_at timestamptz,
  preferred_language text default 'tr',
  preferred_currency char(3) default 'GBP' check (preferred_currency in ('TRY','GBP','USD','EUR')),
  status profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles for each row execute function set_updated_at();

-- Role/status may only change via service role (see 1.4). Reject otherwise.
create or replace function guard_profile_privileged() returns trigger as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'profiles.role/status can only be changed by service role';
  end if;
  return new;
end; $$ language plpgsql security definer;
create trigger trg_profiles_guard before update on profiles for each row execute function guard_profile_privileged();

-- ---- landlord_profiles ----
create table if not exists landlord_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  display_name text,
  is_agency boolean default false,
  agency_name text,
  agency_logo_key text,
  agency_slug text unique,
  about text,
  verification_status verification_status not null default 'unverified',
  verified_at timestamptz, verified_by uuid, verification_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger trg_llp_updated before update on landlord_profiles for each row execute function set_updated_at();

create table if not exists agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_user_id uuid not null references profiles(id) on delete cascade,
  member_user_id uuid not null references profiles(id) on delete cascade,
  role_in_agency text not null default 'staff' check (role_in_agency in ('owner','staff')),
  invited_at timestamptz default now(), accepted_at timestamptz,
  unique (agency_user_id, member_user_id)
);

-- ---- universities ----
create table if not exists universities (
  id uuid primary key default gen_random_uuid(),
  name_tr text, name_en text, name_ru text, name_fr text, name_ar text,
  slug text unique not null, city text,
  campus_location geography(Point,4326),
  coordinates_verified boolean not null default false,
  student_count_estimate int, is_active boolean default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger trg_uni_updated before update on universities for each row execute function set_updated_at();

-- ---- listings ----
create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references landlord_profiles(id) on delete cascade,
  university_id uuid references universities(id) on delete set null,
  reference_code text unique not null,
  source_language text not null default 'tr' check (source_language in ('tr','en')),
  title_tr text, title_en text, description_tr text, description_en text,
  property_type property_type not null,
  bedrooms int default 0, bathrooms int default 1, furnished boolean default true,
  size_sqm int, floor int, has_elevator boolean default false,
  max_occupants int, gender_preference gender_pref default 'any',
  available_from date, minimum_stay_months int,
  price_amount numeric(12,2) not null,
  price_currency char(3) not null check (price_currency in ('TRY','GBP','USD','EUR')),
  price_period price_period not null default 'monthly',
  price_gbp_normalised numeric(12,2),
  deposit_amount numeric(12,2), deposit_currency char(3) check (deposit_currency in ('TRY','GBP','USD','EUR')),
  bills_included boolean default false, bills_note text, agency_fee_note text,
  amenities text[] default '{}',
  location geography(Point,4326), address_private text, neighbourhood text, city text,
  status listing_status not null default 'draft', rejection_reason text,
  published_at timestamptz, expires_at timestamptz, last_confirmed_available_at timestamptz,
  view_count int default 0, contact_reveal_count int default 0,
  price_index_ratio numeric(6,3), risk_flags text[] default '{}',
  search_vector_tr tsvector, search_vector_en tsvector,
  is_demo boolean default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger trg_listing_updated before update on listings for each row execute function set_updated_at();

create table if not exists listing_slugs (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  locale text not null, slug text not null, is_current boolean default true,
  created_at timestamptz not null default now(),
  unique (locale, slug)
);
create index if not exists idx_listing_slugs_listing on listing_slugs(listing_id, is_current);

create table if not exists listing_translations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  locale text not null, title text, description text,
  translation_source translation_source not null default 'machine',
  translated_at timestamptz default now(),
  unique (listing_id, locale)
);

create table if not exists listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  storage_key text not null, sort_order int default 0, width int, height int,
  phash text, alt_text_tr text, alt_text_en text,
  created_at timestamptz not null default now()
);

create table if not exists listing_price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  price_amount numeric(12,2), price_currency char(3),
  price_gbp_normalised numeric(12,2), fx_rate_used numeric(18,8),
  changed_at timestamptz not null default now()
);
create index if not exists idx_price_history_listing on listing_price_history(listing_id, changed_at desc);

-- append price history whenever price changes (insert-only source of truth)
create or replace function log_price_history() returns trigger as $$
begin
  if (tg_op = 'INSERT') or (new.price_amount is distinct from old.price_amount or new.price_currency is distinct from old.price_currency) then
    insert into listing_price_history(listing_id, price_amount, price_currency, price_gbp_normalised, changed_at)
    values (new.id, new.price_amount, new.price_currency, new.price_gbp_normalised, now());
  end if;
  return new;
end; $$ language plpgsql;
create trigger trg_listing_price_hist after insert or update on listings for each row execute function log_price_history();

create table if not exists contact_reveals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  revealed_at timestamptz not null default now(), ip_hash text, user_agent_hash text
);
create index if not exists idx_reveals_student on contact_reveals(student_id, revealed_at desc);
create index if not exists idx_reveals_listing on contact_reveals(listing_id);

create table if not exists saved_listings (
  student_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (student_id, listing_id)
);

create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  student_id uuid references profiles(id) on delete set null,
  message text, source text default 'web' check (source in ('web','whatsapp')),
  status text default 'open', created_at timestamptz not null default now()
);

create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  target_role user_role, listing_quota int, featured_quota int,
  duration_days int, price_amount numeric(12,2), price_currency char(3) check (price_currency in ('TRY','GBP','USD','EUR')),
  is_active boolean default true
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  package_id uuid references packages(id) on delete set null,
  starts_at timestamptz, ends_at timestamptz,
  listings_used int default 0, featured_used int default 0,
  status subscription_status default 'active'
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  amount numeric(12,2), currency char(3) check (currency in ('TRY','GBP','USD','EUR')),
  status invoice_status default 'unpaid',
  issued_at timestamptz default now(), marked_paid_at timestamptz, marked_paid_by uuid,
  bank_reference text, notes text
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete cascade,
  reporter_user_id uuid references profiles(id) on delete set null,
  reporter_ip_hash text, reason text, detail text,
  status report_status default 'open', report_count int default 1,
  resolved_by uuid, created_at timestamptz not null default now()
);

create table if not exists fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency char(3), quote_currency char(3), rate numeric(18,8),
  rate_date date, fetched_at timestamptz default now(),
  unique (base_currency, quote_currency, rate_date)
);

create table if not exists price_index (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references universities(id) on delete cascade,
  property_type property_type, bedrooms int,
  median_price_gbp numeric(12,2), p25_price_gbp numeric(12,2), p75_price_gbp numeric(12,2),
  sample_size int, calculated_at timestamptz default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid, action text, entity_type text, entity_id text,
  before_snapshot jsonb, after_snapshot jsonb, ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_entity on audit_log(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_actor on audit_log(actor_user_id, created_at desc);

create table if not exists system_health (
  id uuid primary key default gen_random_uuid(),
  check_name text, status text, detail text, checked_at timestamptz default now()
);

create table if not exists verification_requests (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid references landlord_profiles(id) on delete cascade,
  document_key text, status verification_status default 'pending',
  created_at timestamptz default now(), reviewed_at timestamptz, reviewed_by uuid
);

create table if not exists whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text unique, locale text default 'tr',
  opt_in_at timestamptz, opt_out_at timestamptz,
  state jsonb default '{}', updated_at timestamptz default now()
);

-- ---- Indexes (1.7) ----
create index if not exists idx_listings_location on listings using gist (location);
create index if not exists idx_listings_status_city_price on listings(status, city, price_amount);
create index if not exists idx_listings_status_pub on listings(status, published_at desc);
create index if not exists idx_listings_svtr on listings using gin (search_vector_tr);
create index if not exists idx_listings_sven on listings using gin (search_vector_en);
create index if not exists idx_listings_amenities on listings using gin (amenities);
create index if not exists idx_listings_expire on listings(expires_at) where status = 'published';
create index if not exists idx_listings_title_trgm on listings using gin (unaccent(lower(coalesce(title_tr,''))) gin_trgm_ops);

-- ===========================================================================
-- Row Level Security (1.8) — enable on every table, then policies.
-- ===========================================================================
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security;', r.tablename);
  end loop;
end $$;

-- helper: is caller an admin (role from JWT app_metadata)
create or replace function is_admin() returns boolean as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$ language sql stable;

-- profiles
create policy profiles_self_select on profiles for select using (id = auth.uid());
create policy profiles_self_update on profiles for update using (id = auth.uid());

-- landlord_profiles
create policy llp_public_select on landlord_profiles for select using (true);
create policy llp_owner_all on landlord_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- universities (public read)
create policy uni_public_select on universities for select using (true);

-- listings
create policy listings_public_select on listings for select using (status = 'published');
create policy listings_owner_select on listings for select using (
  exists (select 1 from landlord_profiles lp where lp.id = listings.landlord_id and lp.user_id = auth.uid())
  or exists (select 1 from landlord_profiles lp join agency_members am on am.agency_user_id = lp.user_id
             where lp.id = listings.landlord_id and am.member_user_id = auth.uid())
);
create policy listings_owner_write on listings for all using (
  exists (select 1 from landlord_profiles lp where lp.id = listings.landlord_id and lp.user_id = auth.uid())
) with check (
  exists (select 1 from landlord_profiles lp where lp.id = listings.landlord_id and lp.user_id = auth.uid())
);
-- NOTE: only service role may set status='published' (enforced in API + service-role path).

-- child tables follow parent visibility
create policy photos_select on listing_photos for select using (
  exists (select 1 from listings l where l.id = listing_photos.listing_id and (l.status='published'
    or exists (select 1 from landlord_profiles lp where lp.id=l.landlord_id and lp.user_id=auth.uid()))));
create policy slugs_select on listing_slugs for select using (true);
create policy translations_select on listing_translations for select using (
  exists (select 1 from listings l where l.id = listing_translations.listing_id and l.status='published'));
create policy pricehist_select on listing_price_history for select using (
  exists (select 1 from listings l where l.id = listing_price_history.listing_id and (l.status='published'
    or exists (select 1 from landlord_profiles lp where lp.id=l.landlord_id and lp.user_id=auth.uid()))));
-- NO update/delete policy on listing_price_history (append-only).

-- contact_reveals: student sees only own rows; landlords use listing_stats() only
create policy reveals_student_select on contact_reveals for select using (student_id = auth.uid());
create policy reveals_student_insert on contact_reveals for insert with check (student_id = auth.uid());

create policy saved_student_all on saved_listings for all using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy inquiries_student_select on inquiries for select using (student_id = auth.uid());
create policy inquiries_landlord_select on inquiries for select using (
  exists (select 1 from listings l join landlord_profiles lp on lp.id=l.landlord_id
          where l.id = inquiries.listing_id and lp.user_id = auth.uid()));
create policy inquiries_insert on inquiries for insert with check (true);

create policy invoices_owner_select on invoices for select using (user_id = auth.uid());
create policy subs_owner_select on subscriptions for select using (user_id = auth.uid());

create policy reports_anon_insert on reports for insert with check (true);
-- NO select policy on reports for non-admins (admins read via service role).
-- NO select policy on audit_log for any regular role.

create policy packages_public_select on packages for select using (is_active = true);

-- security-definer stats fn so landlords get COUNTS only (never raw reveal rows)
create or replace function listing_stats(p_listing uuid)
returns table(views int, reveals int, saves int, inquiries int) as $$
  select
    (select view_count from listings where id = p_listing),
    (select count(*)::int from contact_reveals where listing_id = p_listing),
    (select count(*)::int from saved_listings where listing_id = p_listing),
    (select count(*)::int from inquiries where listing_id = p_listing);
$$ language sql security definer;

-- Acceptance-criteria test helper (1): asserts RLS on every table.
-- select tablename, rowsecurity from pg_tables where schemaname='public' and rowsecurity=false;
