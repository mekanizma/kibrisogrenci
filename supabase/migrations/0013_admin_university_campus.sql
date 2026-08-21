-- Admin helper: set university campus geography from lat/lng (service role / security definer).
create or replace function public.admin_set_university_campus(
  p_id uuid,
  p_lat double precision,
  p_lng double precision
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null or p_lat is null or p_lng is null then
    raise exception 'id, lat and lng are required';
  end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'invalid coordinates';
  end if;
  update public.universities
  set campus_location = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  where id = p_id;
  if not found then
    raise exception 'university not found';
  end if;
end;
$$;

revoke all on function public.admin_set_university_campus(uuid, double precision, double precision) from public;
grant execute on function public.admin_set_university_campus(uuid, double precision, double precision) to service_role;
