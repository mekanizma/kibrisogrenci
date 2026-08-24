-- ===========================================================================
-- 0017_grant_listing_premium_columns.sql
-- Column-level grants: 0003 revoked SELECT on listings and re-granted an
-- allowlist. 0014 added premium_tier/premium_until without granting them, so
-- authenticated my/listings queries failed and the dashboard looked empty.
-- ===========================================================================

grant select (premium_tier, premium_until)
  on table public.listings
  to anon, authenticated;
