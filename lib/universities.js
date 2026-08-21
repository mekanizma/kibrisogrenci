/** Canonical KKTC university directory (slug → display metadata). */

/** All KKTC districts / major cities (fixed order for filters & forms). */
export const KKTC_CITIES = [
  'Lefkoşa',
  'Gazimağusa',
  'Girne',
  'Güzelyurt',
  'İskele',
  'Lefke',
];

export const UNI_CATALOG = [
  { mockId: 'u-emu', slug: 'dogu-akdeniz-universitesi', short: 'EMU/DAÜ', name_tr: 'Doğu Akdeniz Üniversitesi', name_en: 'Eastern Mediterranean University', city: 'Gazimağusa', lat: 35.1442, lng: 33.9106, students: 20000 },
  { mockId: 'u-neu', slug: 'yakin-dogu-universitesi', short: 'NEU/YDÜ', name_tr: 'Yakın Doğu Üniversitesi', name_en: 'Near East University', city: 'Lefkoşa', lat: 35.2286, lng: 33.32, students: 26000 },
  { mockId: 'u-ciu', slug: 'uluslararasi-kibris-universitesi', short: 'CIU/UKÜ', name_tr: 'Uluslararası Kıbrıs Üniversitesi', name_en: 'Cyprus International University', city: 'Lefkoşa', lat: 35.156, lng: 33.411, students: 15000 },
  { mockId: 'u-gau', slug: 'girne-amerikan-universitesi', short: 'GAU', name_tr: 'Girne Amerikan Üniversitesi', name_en: 'Girne American University', city: 'Girne', lat: 35.34, lng: 33.315, students: 12000 },
  { mockId: 'u-kyrenia', slug: 'girne-universitesi', short: 'UoK', name_tr: 'Girne Üniversitesi', name_en: 'University of Kyrenia', city: 'Girne', lat: 35.341, lng: 33.31, students: 8000 },
  { mockId: 'u-final', slug: 'final-international-university', short: 'FIU', name_tr: 'Final Uluslararası Üniversitesi', name_en: 'Final International University', city: 'Girne', lat: 35.3364, lng: 33.319, students: 6000 },
  { mockId: 'u-metu', slug: 'odtu-kuzey-kibris', short: 'ODTÜ', name_tr: 'ODTÜ Kuzey Kıbrıs Kampüsü', name_en: 'METU Northern Cyprus Campus', city: 'Güzelyurt', lat: 35.142, lng: 32.97, students: 3500 },
  { mockId: 'u-eul', slug: 'avrupa-universitesi-lefke', short: 'EUL/AÜL', name_tr: 'Avrupa Üniversitesi Lefke', name_en: 'European University of Lefke', city: 'Lefke', lat: 35.112, lng: 32.85, students: 10000 },
  { mockId: 'u-bau', slug: 'bahcesehir-kibris-universitesi', short: 'BAU', name_tr: 'Bahçeşehir Kıbrıs Üniversitesi', name_en: 'Bahçeşehir Cyprus University', city: 'Lefkoşa', lat: 35.185, lng: 33.36, students: 5000 },
  { mockId: 'u-rdu', slug: 'rauf-denktas-universitesi', short: 'RDÜ', name_tr: 'Rauf Denktaş Üniversitesi', name_en: 'Rauf Denktash University', city: 'Lefkoşa', lat: 35.19, lng: 33.355, students: 2500 },
  { mockId: 'u-kstu', slug: 'kibris-saglik-ve-toplum-bilimleri-universitesi', short: 'KSTÜ', name_tr: 'Kıbrıs Sağlık ve Toplum Bilimleri Üniversitesi', name_en: 'Cyprus Health and Social Sciences University', city: 'Güzelyurt', lat: 35.2, lng: 32.99, students: 2000 },
  { mockId: 'u-aku', slug: 'ada-kent-universitesi', short: 'AKÜ', name_tr: 'Ada Kent Üniversitesi', name_en: 'University of City Island', city: 'Gazimağusa', lat: 35.13, lng: 33.92, students: 3000 },
  { mockId: 'u-umk', slug: 'kibris-ilim-universitesi', short: 'KİÜ', name_tr: 'Kıbrıs İlim Üniversitesi', name_en: 'University of Mediterranean Karpasia', city: 'Gazimağusa', lat: 35.125, lng: 33.94, students: 2500 },
  { mockId: 'u-arucad', slug: 'arkin-yaratici-sanatlar-ve-tasarim-universitesi', short: 'ARUCAD', name_tr: 'Arkın Yaratıcı Sanatlar ve Tasarım Üniversitesi', name_en: 'Arkin University of Creative Arts and Design', city: 'Girne', lat: 35.338, lng: 33.318, students: 1500 },
  { mockId: 'u-cwu', slug: 'kibris-bati-universitesi', short: 'KBÜ', name_tr: 'Kıbrıs Batı Üniversitesi', name_en: 'Cyprus West University', city: 'Gazimağusa', lat: 35.135, lng: 33.915, students: 2000 },
  { mockId: 'u-auc', slug: 'kibris-amerikan-universitesi', short: 'KAÜ', name_tr: 'Kıbrıs Amerikan Üniversitesi', name_en: 'American University of Cyprus', city: 'Girne', lat: 35.335, lng: 33.322, students: 1800 },
];

const SHORT_BY_SLUG = Object.fromEntries(UNI_CATALOG.map((u) => [u.slug, u.short]));
const META_BY_SLUG = Object.fromEntries(UNI_CATALOG.map((u) => [u.slug, u]));

export function universityShort(slug, nameEn = '', nameTr = '') {
  if (slug && SHORT_BY_SLUG[slug]) return SHORT_BY_SLUG[slug];
  const src = nameEn || nameTr || slug || '';
  const initials = src
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 5)
    .toUpperCase();
  return initials || 'UNI';
}

export function universityMeta(slug) {
  return slug ? META_BY_SLUG[slug] || null : null;
}

/** Normalize body.university_ids / university_id into unique uuid list (primary first). */
export function normalizeUniversityIds(body) {
  const raw = [];
  if (Array.isArray(body?.university_ids)) raw.push(...body.university_ids);
  else if (typeof body?.university_ids === 'string' && body.university_ids.trim()) {
    raw.push(...body.university_ids.split(',').map((s) => s.trim()));
  }
  if (body?.university_id) raw.unshift(body.university_id);
  const seen = new Set();
  const out = [];
  for (const id of raw) {
    const v = String(id || '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
