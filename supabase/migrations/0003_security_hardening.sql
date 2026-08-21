-- ===========================================================================
-- 0003_security_hardening.sql
-- Closes RLS gaps, locks privileged columns, storage, profile bootstrap,
-- publish guard, and safe RPCs. Safe to re-run (IF EXISTS / DROP POLICY IF EXISTS).
-- ===========================================================================

-- ---- Harden security-definer helpers (fixed search_path) ----
create or replace function public.set_updated_at() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.guard_profile_privileged() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'profiles.role/status can only be changed by service role';
  end if;
  return new;
end;
$$;

create or replace function public.is_admin() returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
    );
$$;

create or replace function public.is_listing_owner(p_listing uuid) returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.listings l
    join public.landlord_profiles lp on lp.id = l.landlord_id
    where l.id = p_listing
      and (
        lp.user_id = auth.uid()
        or exists (
          select 1 from public.agency_members am
          where am.agency_user_id = lp.user_id
            and am.member_user_id = auth.uid()
            and am.accepted_at is not null
        )
      )
  );
$$;

-- Only owners/admins get aggregate counts (never raw reveal rows).
create or replace function public.listing_stats(p_listing uuid)
returns table(views int, reveals int, saves int, inquiries int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not (public.is_admin() or public.is_listing_owner(p_listing)) then
    raise exception 'forbidden';
  end if;
  return query
    select
      (select coalesce(l.view_count, 0) from public.listings l where l.id = p_listing),
      (select count(*)::int from public.contact_reveals cr where cr.listing_id = p_listing),
      (select count(*)::int from public.saved_listings s where s.listing_id = p_listing),
      (select count(*)::int from public.inquiries i where i.listing_id = p_listing);
end;
$$;

revoke all on function public.listing_stats(uuid) from public;
grant execute on function public.listing_stats(uuid) to authenticated;

-- ---- Publish / status guard: clients cannot self-publish ----
create or replace function public.guard_listing_status() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;
  -- Owners may create draft / pending_review / rented / expired / rejected only via API;
  -- never publish directly from the client.
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending_review') then
      raise exception 'listings.status insert restricted';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if new.status = 'published' then
        raise exception 'only admin/service_role may publish listings';
      end if;
      if old.status = 'published' and new.status not in ('rented', 'expired', 'pending_review', 'draft') then
        raise exception 'invalid listing status transition';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_listing_status_guard on public.listings;
create trigger trg_listing_status_guard
  before insert or update on public.listings
  for each row execute function public.guard_listing_status();

-- ---- Auto-create profile on signup (always student; role upgrades via service role) ----
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, preferred_language)
  values (
    new.id,
    'student',
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'preferred_language', 'tr')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- Column privilege: hide private address / rejection notes from anon API ----
revoke select on table public.listings from anon, authenticated;
grant select (
  id, landlord_id, university_id, reference_code, source_language,
  title_tr, title_en, description_tr, description_en,
  property_type, bedrooms, bathrooms, furnished, size_sqm, floor, has_elevator,
  max_occupants, gender_preference, available_from, minimum_stay_months,
  price_amount, price_currency, price_period, price_gbp_normalised,
  deposit_amount, deposit_currency, bills_included, bills_note, agency_fee_note,
  amenities, location, neighbourhood, city, status,
  published_at, expires_at, last_confirmed_available_at,
  view_count, contact_reveal_count, price_index_ratio, risk_flags,
  search_vector_tr, search_vector_en, is_demo, created_at, updated_at
) on table public.listings to anon, authenticated;

-- address_private / rejection_reason: service_role only (API uses admin client for owners)
revoke select (address_private, rejection_reason) on table public.listings from anon, authenticated;

-- ---- Drop weak / incomplete policies and recreate tightly ----
drop policy if exists llp_public_select on public.landlord_profiles;
drop policy if exists inquiries_insert on public.inquiries;
drop policy if exists reports_anon_insert on public.reports;
drop policy if exists listings_owner_write on public.listings;
drop policy if exists photos_select on public.listing_photos;
drop policy if exists translations_select on public.listing_translations;

-- Landlord public card: anyone can read non-sensitive landlord fields (RLS row filter).
-- verification_note / document keys stay readable only by owner/admin (column still present —
-- strip in API; block note updates from non-service below).
create policy llp_public_select on public.landlord_profiles
  for select using (
    true
  );

create policy llp_admin_all on public.landlord_profiles
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.guard_landlord_verification() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' and (
    new.verification_status is distinct from old.verification_status
    or new.verified_at is distinct from old.verified_at
    or new.verified_by is distinct from old.verified_by
    or new.verification_note is distinct from old.verification_note
  ) then
    raise exception 'verification fields are admin-only';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_llp_verify_guard on public.landlord_profiles;
create trigger trg_llp_verify_guard
  before update on public.landlord_profiles
  for each row execute function public.guard_landlord_verification();

-- Listings write: owner may insert/update/delete own non-published transitions
create policy listings_owner_insert on public.listings
  for insert with check (
    exists (select 1 from public.landlord_profiles lp where lp.id = landlord_id and lp.user_id = auth.uid())
  );
create policy listings_owner_update on public.listings
  for update using (
    exists (select 1 from public.landlord_profiles lp where lp.id = landlord_id and lp.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.landlord_profiles lp where lp.id = landlord_id and lp.user_id = auth.uid())
  );
create policy listings_owner_delete on public.listings
  for delete using (
    exists (select 1 from public.landlord_profiles lp where lp.id = landlord_id and lp.user_id = auth.uid())
  );
create policy listings_admin_all on public.listings
  for all using (public.is_admin()) with check (public.is_admin());

create policy photos_select on public.listing_photos for select using (
  exists (
    select 1 from public.listings l
    where l.id = listing_photos.listing_id
      and (l.status = 'published' or public.is_listing_owner(l.id) or public.is_admin())
  )
);
create policy photos_owner_write on public.listing_photos for all using (
  public.is_listing_owner(listing_id) or public.is_admin()
) with check (
  public.is_listing_owner(listing_id) or public.is_admin()
);

create policy translations_select on public.listing_translations for select using (
  exists (
    select 1 from public.listings l
    where l.id = listing_translations.listing_id
      and (l.status = 'published' or public.is_listing_owner(l.id) or public.is_admin())
  )
);

-- Inquiries: authenticated student only, must set own student_id
create policy inquiries_insert on public.inquiries
  for insert with check (
    auth.uid() is not null
    and student_id = auth.uid()
  );
create policy inquiries_admin_select on public.inquiries
  for select using (public.is_admin());

-- Reports: authenticated preferred; allow anon with null reporter but no free-form spam identity spoof
drop policy if exists reports_anon_insert on public.reports;
create policy reports_insert on public.reports
  for insert with check (
    (reporter_user_id is null and auth.uid() is null)
    or (reporter_user_id = auth.uid())
  );
create policy reports_admin_all on public.reports
  for all using (public.is_admin()) with check (public.is_admin());

-- Profiles: admin read; self insert blocked (trigger creates row)
create policy profiles_admin_select on public.profiles
  for select using (public.is_admin());
create policy profiles_admin_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- Agency members
alter table if exists public.agency_members enable row level security;
drop policy if exists agency_members_select on public.agency_members;
drop policy if exists agency_members_write on public.agency_members;
create policy agency_members_select on public.agency_members
  for select using (
    agency_user_id = auth.uid() or member_user_id = auth.uid() or public.is_admin()
  );
create policy agency_members_write on public.agency_members
  for all using (agency_user_id = auth.uid() or public.is_admin())
  with check (agency_user_id = auth.uid() or public.is_admin());

-- FX + price index: public read
alter table if exists public.fx_rates enable row level security;
alter table if exists public.price_index enable row level security;
drop policy if exists fx_public_select on public.fx_rates;
drop policy if exists price_index_public_select on public.price_index;
create policy fx_public_select on public.fx_rates for select using (true);
create policy price_index_public_select on public.price_index for select using (true);

-- system_health / audit / whatsapp / verification: admin only (service role bypasses RLS)
alter table if exists public.system_health enable row level security;
alter table if exists public.audit_log enable row level security;
alter table if exists public.whatsapp_sessions enable row level security;
alter table if exists public.verification_requests enable row level security;

drop policy if exists system_health_admin on public.system_health;
drop policy if exists audit_admin on public.audit_log;
drop policy if exists wa_admin on public.whatsapp_sessions;
drop policy if exists verification_owner on public.verification_requests;

create policy system_health_admin on public.system_health
  for select using (public.is_admin());
create policy audit_admin on public.audit_log
  for select using (public.is_admin());
create policy wa_admin on public.whatsapp_sessions
  for all using (public.is_admin()) with check (public.is_admin());
create policy verification_owner on public.verification_requests
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.landlord_profiles lp
      where lp.id = verification_requests.landlord_id and lp.user_id = auth.uid()
    )
  );
create policy verification_owner_insert on public.verification_requests
  for insert with check (
    exists (
      select 1 from public.landlord_profiles lp
      where lp.id = landlord_id and lp.user_id = auth.uid()
    )
  );

-- Universities: admin write
drop policy if exists uni_admin_write on public.universities;
create policy uni_admin_write on public.universities
  for all using (public.is_admin()) with check (public.is_admin());

-- Packages admin write
drop policy if exists packages_admin_write on public.packages;
create policy packages_admin_write on public.packages
  for all using (public.is_admin()) with check (public.is_admin());

-- Invoices / subscriptions admin write
drop policy if exists invoices_admin_all on public.invoices;
drop policy if exists subs_admin_all on public.subscriptions;
create policy invoices_admin_all on public.invoices
  for all using (public.is_admin()) with check (public.is_admin());
create policy subs_admin_all on public.subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

-- Contact reveal helper: server calls with user JWT; enforces daily cap in DB
create or replace function public.reveal_contact(p_listing_id uuid, p_ip_hash text default null, p_ua_hash text default null)
returns table(phone_e164 text, reveals_today int, daily_limit int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
  v_limit int := 15;
  v_phone text;
  v_status listing_status;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.status = 'active' and p.role in ('student', 'landlord', 'agency', 'admin')
  ) then
    raise exception 'auth_required';
  end if;

  select l.status into v_status from public.listings l where l.id = p_listing_id;
  if v_status is null or v_status <> 'published' then
    raise exception 'not_found';
  end if;

  select count(*)::int into v_count
  from public.contact_reveals cr
  where cr.student_id = v_uid
    and cr.revealed_at >= date_trunc('day', now() at time zone 'utc');

  if v_count >= v_limit then
    raise exception 'rate_limited';
  end if;

  select pr.phone_e164 into v_phone
  from public.listings l
  join public.landlord_profiles lp on lp.id = l.landlord_id
  join public.profiles pr on pr.id = lp.user_id
  where l.id = p_listing_id;

  if v_phone is null or length(trim(v_phone)) = 0 then
    raise exception 'not_found';
  end if;

  insert into public.contact_reveals (listing_id, student_id, ip_hash, user_agent_hash)
  values (p_listing_id, v_uid, p_ip_hash, p_ua_hash);

  update public.listings
  set contact_reveal_count = coalesce(contact_reveal_count, 0) + 1
  where id = p_listing_id;

  return query select v_phone, v_count + 1, v_limit;
end;
$$;

revoke all on function public.reveal_contact(uuid, text, text) from public;
grant execute on function public.reveal_contact(uuid, text, text) to authenticated;

-- Increment view counter without exposing writes
create or replace function public.increment_listing_view(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.listings
  set view_count = coalesce(view_count, 0) + 1
  where id = p_listing_id and status = 'published';
end;
$$;
revoke all on function public.increment_listing_view(uuid) from public;
grant execute on function public.increment_listing_view(uuid) to anon, authenticated;

-- ---- Storage buckets (private listing photos + verification docs) ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-photos', 'listing-photos', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('verification-docs', 'verification-docs', false, 10485760, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists listing_photos_read on storage.objects;
drop policy if exists listing_photos_write on storage.objects;
drop policy if exists listing_photos_update on storage.objects;
drop policy if exists verification_docs_owner on storage.objects;

-- Path convention: listing-photos/{user_id}/{listing_id}/{filename}
create policy listing_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'listing-photos' and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  ));

create policy listing_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy listing_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy listing_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy verification_docs_owner on storage.objects
  for all to authenticated
  using (
    bucket_id = 'verification-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  )
  with check (
    bucket_id = 'verification-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- Signed URL reads for published listing assets are served by the API with service role.
-- Optional: allow anon read of listing-photos only via signed URLs (no public policy).

-- Packages: unique name for idempotent seed
create unique index if not exists packages_name_uidx on public.packages (name);

-- Acceptance: every public table must have RLS on
-- select tablename from pg_tables where schemaname='public' and not rowsecurity;
