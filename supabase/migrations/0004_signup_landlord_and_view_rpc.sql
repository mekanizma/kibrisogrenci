-- Allow signup metadata role=landlord; keep admin only via service role
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'student');
begin
  if v_role not in ('student', 'landlord') then
    v_role := 'student';
  end if;
  insert into public.profiles (id, role, full_name, preferred_language)
  values (
    new.id,
    v_role::public.user_role,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'preferred_language', 'tr')
  )
  on conflict (id) do nothing;

  if v_role = 'landlord' then
    insert into public.landlord_profiles (user_id, display_name)
    select new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
    where not exists (
      select 1 from public.landlord_profiles lp where lp.user_id = new.id
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.increment_listing_view(uuid) from anon, public;
grant execute on function public.increment_listing_view(uuid) to service_role, authenticated;
