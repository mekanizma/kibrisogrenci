-- Paste into Supabase Dashboard → SQL Editor → Run
-- Adds listing_status 'paused' for owner freeze/pause.

do $$ begin
  alter type public.listing_status add value if not exists 'paused';
exception
  when duplicate_object then null;
  when others then
    begin
      alter type public.listing_status add value 'paused';
    exception when duplicate_object then null;
    end;
end $$;
