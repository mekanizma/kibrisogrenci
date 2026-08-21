/** Lightweight client placeholders — refs must exist in lib/seed.js LISTINGS. */
const P = [
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=640&q=70',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=640&q=70',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=640&q=70',
  'https://images.unsplash.com/photo-1493809842364-82806fdbf73d?auto=format&fit=crop&w=640&q=70',
  'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=640&q=70',
  'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=640&q=70',
];

export const MOCK_PHOTOS = P;

export const MOCK_FEATURED = [
  {
    id: 'l-1', reference_code: 'A3F9K2',
    title_tr: 'Kampüse yakın eşyalı 2+1', title_en: 'Furnished 2+1 near campus',
    property_type: 'apartment', bedrooms: 2, size_sqm: 85,
    price: { amount: 480, currency: 'GBP' }, city: 'Gazimağusa', neighbourhood: 'Sakarya',
    photos: [P[0]], landlord_verified: true, walking_minutes: 8, distance_m: 550,
  },
  {
    id: 'l-2', reference_code: 'H7M4P8',
    title_tr: 'Uygun fiyatlı stüdyo', title_en: 'Affordable studio',
    property_type: 'studio', bedrooms: 0, size_sqm: 35,
    price: { amount: 11000, currency: 'TRY' }, city: 'Gazimağusa', neighbourhood: 'Karakol',
    photos: [P[1]], landlord_verified: true, walking_minutes: 12, distance_m: 900,
  },
  {
    id: 'l-3', reference_code: 'R2X6B9',
    title_tr: 'Deniz manzaralı 2+1', title_en: 'Sea-view 2+1',
    property_type: 'apartment', bedrooms: 2, size_sqm: 95,
    price: { amount: 620, currency: 'GBP' }, city: 'Girne', neighbourhood: 'Karakum',
    photos: [P[2]], landlord_verified: true, landlord_is_agency: true, walking_minutes: 15, distance_m: 1100,
  },
  {
    id: 'l-4', reference_code: 'K5N8T3',
    title_tr: 'Üniversite karşısı 1+1', title_en: '1+1 opposite campus',
    property_type: 'apartment', bedrooms: 1, size_sqm: 55,
    price: { amount: 380, currency: 'GBP' }, city: 'Lefkoşa', neighbourhood: 'Yenikent',
    photos: [P[3]], landlord_verified: true, walking_minutes: 5, distance_m: 400,
  },
  {
    id: 'l-7', reference_code: 'T8V3Z5',
    title_tr: 'Paylaşımlı öğrenci evi', title_en: 'Shared student house',
    property_type: 'room', bedrooms: 1, size_sqm: 18,
    price: { amount: 250, currency: 'GBP' }, city: 'Girne', neighbourhood: 'Merkez',
    photos: [P[4]], landlord_verified: true, walking_minutes: 18, distance_m: 1400,
  },
  {
    id: 'l-13', reference_code: 'C7D2E5',
    title_tr: 'Yeni eşyalı daire', title_en: 'Newly furnished flat',
    property_type: 'apartment', bedrooms: 2, size_sqm: 78,
    price: { amount: 520, currency: 'GBP' }, city: 'Lefkoşa', neighbourhood: 'Haspolat',
    photos: [P[5]], landlord_verified: true, walking_minutes: 10, distance_m: 750,
  },
];
