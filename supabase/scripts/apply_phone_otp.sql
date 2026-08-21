-- Paste into Supabase Dashboard → SQL Editor → Run

alter table public.profiles
  add column if not exists phone_verified_at timestamptz;

create table if not exists public.phone_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone_e164 text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_phone_otp_user_created
  on public.phone_otp_challenges (user_id, created_at desc);

alter table public.phone_otp_challenges enable row level security;
