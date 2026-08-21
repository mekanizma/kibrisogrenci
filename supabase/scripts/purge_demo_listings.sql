-- Production cleanup: remove seed/demo listings (and cascading photos/history).
-- Run once in Supabase SQL Editor after go-live if demo data was seeded.

delete from listings where is_demo = true;

-- Optional: list landlords awaiting identity verification
-- select lp.id, lp.display_name, lp.verification_status, lp.verification_note, p.full_name
-- from landlord_profiles lp
-- left join profiles p on p.id = lp.user_id
-- where lp.verification_status = 'pending'
-- order by lp.updated_at desc nulls last;
