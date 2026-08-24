-- ===========================================================================
-- 0016_premium_orders_shopier_product.sql — PAT checkout product id
-- ===========================================================================

alter table public.premium_orders
  add column if not exists shopier_product_id text;

create index if not exists premium_orders_shopier_product_idx
  on public.premium_orders (shopier_product_id)
  where shopier_product_id is not null;

comment on column public.premium_orders.shopier_product_id is
  'Ephemeral Shopier product id created for PAT hosted checkout';
