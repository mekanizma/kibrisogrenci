-- Profile settings expansion + private avatars bucket
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/gglvjbajtthsczofgjdz/sql/new

alter table public.profiles
  add column if not exists avatar_key text,
  add column if not exists bio text,
  add column if not exists city text,
  add column if not exists university_id uuid references public.universities(id) on delete set null;

comment on column public.profiles.avatar_key is 'storage key in avatars bucket: {user_id}/avatar.{ext}';
comment on column public.profiles.bio is 'short public bio (optional)';
comment on column public.profiles.city is 'preferred city for search defaults';

create index if not exists idx_profiles_university on public.profiles (university_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_select on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;

create policy avatars_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );
