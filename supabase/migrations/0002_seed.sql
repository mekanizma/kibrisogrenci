-- 0002_seed.sql — reference data. Demo rows flagged is_demo so a single command purges them.
-- Universities (placeholder coords, coordinates_verified=false per 2.3/2.7).
insert into universities (name_tr, name_en, slug, city, coordinates_verified, student_count_estimate, campus_location) values
 ('Doğu Akdeniz Üniversitesi','Eastern Mediterranean University','dogu-akdeniz-universitesi','Gazimağusa', false, 20000, ST_SetSRID(ST_MakePoint(33.9106,35.1442),4326)),
 ('Yakın Doğu Üniversitesi','Near East University','yakin-dogu-universitesi','Lefkoşa', false, 26000, ST_SetSRID(ST_MakePoint(33.3200,35.2286),4326)),
 ('Uluslararası Kıbrıs Üniversitesi','Cyprus International University','uluslararasi-kibris-universitesi','Lefkoşa', false, 15000, ST_SetSRID(ST_MakePoint(33.4110,35.1560),4326)),
 ('Final Uluslararası Üniversitesi','Final International University','final-international-university','Girne', false, 6000, ST_SetSRID(ST_MakePoint(33.3190,35.3364),4326)),
 ('Girne Amerikan Üniversitesi','Girne American University','girne-amerikan-universitesi','Girne', false, 12000, ST_SetSRID(ST_MakePoint(33.3150,35.3400),4326)),
 ('Girne Üniversitesi','University of Kyrenia','girne-universitesi','Girne', false, 8000, ST_SetSRID(ST_MakePoint(33.3100,35.3410),4326)),
 ('ODTÜ Kuzey Kıbrıs Kampüsü','METU Northern Cyprus Campus','odtu-kuzey-kibris','Güzelyurt', false, 3500, ST_SetSRID(ST_MakePoint(32.9700,35.1420),4326))
on conflict (slug) do nothing;

-- Packages (Starter 3 / Pro 15 / Agency 60), offline bank transfer, admin-activated.
insert into packages (name, target_role, listing_quota, featured_quota, duration_days, price_amount, price_currency) values
 ('Starter','landlord',3,0,30,500,'TRY'),
 ('Pro','landlord',15,3,90,2000,'TRY'),
 ('Agency','agency',60,10,180,6000,'TRY')
on conflict (name) do nothing;

-- FX seed (GBP base). The worker refreshes these daily.
insert into fx_rates (base_currency, quote_currency, rate, rate_date) values
 ('GBP','TRY',42.7, current_date), ('GBP','USD',1.27, current_date), ('GBP','EUR',1.17, current_date)
on conflict (base_currency, quote_currency, rate_date) do nothing;

-- Purge demo data before launch:  delete from listings where is_demo;  (photos/history cascade)
