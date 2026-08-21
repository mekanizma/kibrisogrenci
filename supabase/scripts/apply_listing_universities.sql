-- Apply multi-campus listing support (safe to re-run).
create table if not exists listing_universities (
  listing_id uuid not null references public.listings(id) on delete cascade,
  university_id uuid not null references public.universities(id) on delete cascade,
  sort_order int not null default 0,
  primary key (listing_id, university_id)
);

create index if not exists listing_universities_uni_idx on listing_universities (university_id);
create index if not exists listing_universities_listing_idx on listing_universities (listing_id);

alter table listing_universities enable row level security;

drop policy if exists listing_universities_public_select on listing_universities;
create policy listing_universities_public_select on listing_universities
  for select using (true);

insert into listing_universities (listing_id, university_id, sort_order)
select id, university_id, 0
from listings
where university_id is not null
on conflict do nothing;
