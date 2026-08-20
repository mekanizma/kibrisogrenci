-- Reverse of 0001_init.sql (drops everything). Use with care.
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname='public' loop
    execute format('drop table if exists public.%I cascade;', r.tablename);
  end loop;
end $$;
drop function if exists set_updated_at cascade;
drop function if exists guard_profile_privileged cascade;
drop function if exists log_price_history cascade;
drop function if exists is_admin cascade;
drop function if exists listing_stats cascade;
drop type if exists user_role, profile_status, verification_status, property_type, price_period, gender_pref, listing_status, invoice_status, subscription_status, report_status, translation_source cascade;
