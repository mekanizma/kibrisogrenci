-- ===========================================================================
-- 0019_roommate_criteria.sql
-- Desired roommate criteria stored as JSON on listings.
-- ===========================================================================

alter table public.listings
  add column if not exists roommate_criteria jsonb not null default '{}'::jsonb;

comment on column public.listings.roommate_criteria is
  'Desired roommate criteria: marital_status, age_min, age_max, employment, university_id, pets, smoking';

grant select (roommate_criteria)
  on table public.listings
  to anon, authenticated;
