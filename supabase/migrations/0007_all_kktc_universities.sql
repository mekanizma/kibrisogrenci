-- Expand active university directory to cover major KKTC campuses.
insert into universities (name_tr, name_en, slug, city, coordinates_verified, student_count_estimate, campus_location, is_active) values
 ('Doğu Akdeniz Üniversitesi','Eastern Mediterranean University','dogu-akdeniz-universitesi','Gazimağusa', true, 20000, ST_SetSRID(ST_MakePoint(33.9106,35.1442),4326), true),
 ('Yakın Doğu Üniversitesi','Near East University','yakin-dogu-universitesi','Lefkoşa', true, 26000, ST_SetSRID(ST_MakePoint(33.3200,35.2286),4326), true),
 ('Uluslararası Kıbrıs Üniversitesi','Cyprus International University','uluslararasi-kibris-universitesi','Lefkoşa', true, 15000, ST_SetSRID(ST_MakePoint(33.4110,35.1560),4326), true),
 ('Girne Amerikan Üniversitesi','Girne American University','girne-amerikan-universitesi','Girne', true, 12000, ST_SetSRID(ST_MakePoint(33.3150,35.3400),4326), true),
 ('Girne Üniversitesi','University of Kyrenia','girne-universitesi','Girne', true, 8000, ST_SetSRID(ST_MakePoint(33.3100,35.3410),4326), true),
 ('Final Uluslararası Üniversitesi','Final International University','final-international-university','Girne', true, 6000, ST_SetSRID(ST_MakePoint(33.3190,35.3364),4326), true),
 ('ODTÜ Kuzey Kıbrıs Kampüsü','METU Northern Cyprus Campus','odtu-kuzey-kibris','Güzelyurt', true, 3500, ST_SetSRID(ST_MakePoint(32.9700,35.1420),4326), true),
 ('Avrupa Üniversitesi Lefke','European University of Lefke','avrupa-universitesi-lefke','Lefke', true, 10000, ST_SetSRID(ST_MakePoint(32.8500,35.1120),4326), true),
 ('Bahçeşehir Kıbrıs Üniversitesi','Bahçeşehir Cyprus University','bahcesehir-kibris-universitesi','Lefkoşa', true, 5000, ST_SetSRID(ST_MakePoint(33.3600,35.1850),4326), true),
 ('Rauf Denktaş Üniversitesi','Rauf Denktash University','rauf-denktas-universitesi','Lefkoşa', true, 2500, ST_SetSRID(ST_MakePoint(33.3550,35.1900),4326), true),
 ('Kıbrıs Sağlık ve Toplum Bilimleri Üniversitesi','Cyprus Health and Social Sciences University','kibris-saglik-ve-toplum-bilimleri-universitesi','Güzelyurt', true, 2000, ST_SetSRID(ST_MakePoint(32.9900,35.2000),4326), true),
 ('Ada Kent Üniversitesi','University of City Island','ada-kent-universitesi','Gazimağusa', true, 3000, ST_SetSRID(ST_MakePoint(33.9200,35.1300),4326), true),
 ('Kıbrıs İlim Üniversitesi','University of Mediterranean Karpasia','kibris-ilim-universitesi','Gazimağusa', true, 2500, ST_SetSRID(ST_MakePoint(33.9400,35.1250),4326), true),
 ('Arkın Yaratıcı Sanatlar ve Tasarım Üniversitesi','Arkin University of Creative Arts and Design','arkin-yaratici-sanatlar-ve-tasarim-universitesi','Girne', true, 1500, ST_SetSRID(ST_MakePoint(33.3180,35.3380),4326), true),
 ('Kıbrıs Batı Üniversitesi','Cyprus West University','kibris-bati-universitesi','Gazimağusa', true, 2000, ST_SetSRID(ST_MakePoint(33.9150,35.1350),4326), true),
 ('Kıbrıs Amerikan Üniversitesi','American University of Cyprus','kibris-amerikan-universitesi','Girne', true, 1800, ST_SetSRID(ST_MakePoint(33.3220,35.3350),4326), true)
on conflict (slug) do update set
  name_tr = excluded.name_tr,
  name_en = excluded.name_en,
  city = excluded.city,
  student_count_estimate = excluded.student_count_estimate,
  campus_location = excluded.campus_location,
  coordinates_verified = true,
  is_active = true,
  updated_at = now();
