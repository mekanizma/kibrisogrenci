-- ===========================================================================
-- 0014_listing_premium.sql — per-listing promote (Bronze / Gold / Platinum)
-- ===========================================================================

alter table public.listings
  add column if not exists premium_tier text
    check (premium_tier is null or premium_tier in ('bronze', 'gold', 'platinum'));

alter table public.listings
  add column if not exists premium_until timestamptz;

create index if not exists listings_premium_active_idx
  on public.listings (premium_tier, premium_until desc)
  where premium_tier is not null and status = 'published';

comment on column public.listings.premium_tier is 'Active promote plan: bronze | gold | platinum';
comment on column public.listings.premium_until is 'Promote expiry; features off after this timestamp';
