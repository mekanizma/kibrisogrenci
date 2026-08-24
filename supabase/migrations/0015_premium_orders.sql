-- ===========================================================================
-- 0015_premium_orders.sql — Shopier premium promote orders
-- ===========================================================================

do $$ begin
  create type premium_order_status as enum ('pending', 'paid', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.premium_orders (
  id uuid primary key default gen_random_uuid(),
  platform_order_id text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  plan_id text not null check (plan_id in ('bronze', 'gold', 'platinum')),
  amount numeric(12,2) not null,
  currency char(3) not null default 'TRY' check (currency in ('TRY','GBP','USD','EUR')),
  status premium_order_status not null default 'pending',
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  shopier_payment_id text,
  shopier_payload jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists premium_orders_user_idx
  on public.premium_orders (user_id, created_at desc);

create index if not exists premium_orders_listing_idx
  on public.premium_orders (listing_id, created_at desc);

create index if not exists premium_orders_status_idx
  on public.premium_orders (status);

alter table public.premium_orders enable row level security;

drop policy if exists premium_orders_owner_select on public.premium_orders;
create policy premium_orders_owner_select on public.premium_orders
  for select to authenticated
  using (user_id = auth.uid());

comment on table public.premium_orders is 'Shopier checkout orders for listing promote plans';
