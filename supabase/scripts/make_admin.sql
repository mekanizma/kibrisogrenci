-- Run AFTER you sign up once on the live site.
-- Replace YOUR_EMAIL with the admin email you registered.

update public.profiles
set role = 'admin'
where id = (
  select id from auth.users where email = 'YOUR_EMAIL'
);

-- Then in Dashboard → Authentication → Users → that user → App Metadata:
-- { "role": "admin" }
-- Sign out and sign in again so the JWT picks up app_metadata.role.
