-- Unified free signup: every user can list; always create landlord_profiles.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(nullif(trim(new.raw_user_meta_data->>'role'), ''), 'landlord');
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );
  v_phone text := nullif(trim(new.raw_user_meta_data->>'phone_e164'), '');
  v_lang text := coalesce(nullif(trim(new.raw_user_meta_data->>'preferred_language'), ''), 'tr');
  v_agency boolean := coalesce((new.raw_user_meta_data->>'is_agency')::boolean, false);
  v_agency_name text := nullif(trim(new.raw_user_meta_data->>'agency_name'), '');
begin
  if v_role = 'admin' then
    null;
  elsif v_role not in ('student', 'landlord') then
    v_role := 'landlord';
  else
    if v_role = 'student' then
      v_role := 'landlord';
    end if;
  end if;

  insert into public.profiles (id, role, full_name, phone_e164, preferred_language)
  values (
    new.id,
    v_role::public.user_role,
    v_name,
    v_phone,
    v_lang
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone_e164 = coalesce(excluded.phone_e164, public.profiles.phone_e164),
    preferred_language = coalesce(excluded.preferred_language, public.profiles.preferred_language);

  if v_role <> 'admin' then
    if not exists (select 1 from public.landlord_profiles lp where lp.user_id = new.id) then
      insert into public.landlord_profiles (user_id, display_name, is_agency, agency_name)
      values (new.id, v_name, v_agency, v_agency_name);
    else
      update public.landlord_profiles
      set
        display_name = coalesce(v_name, display_name),
        is_agency = v_agency,
        agency_name = coalesce(v_agency_name, agency_name)
      where user_id = new.id;
    end if;
  end if;

  return new;
end;
$$;
