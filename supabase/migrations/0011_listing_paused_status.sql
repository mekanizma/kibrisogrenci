-- Owner listing lifecycle: pause (freeze) status
-- Run in Supabase SQL Editor if not applied via migration push.

do $$ begin
  alter type public.listing_status add value if not exists 'paused';
exception
  when duplicate_object then null;
  when others then
    -- PG < 15 may not support IF NOT EXISTS; try plain add
    begin
      alter type public.listing_status add value 'paused';
    exception when duplicate_object then null;
    end;
end $$;
