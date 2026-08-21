// ============================================================================
// MOCK SEED DATA for kibrisogrenci.com  (MOCKED — replace with Supabase later)
// All money stored as { amount, currency }. GBP is the analytical base.
// ============================================================================

// FX: rate to convert 1 unit of currency -> GBP  (mock June 2025 rates)
export const FX_TO_GBP = { TRY: 0.0234, USD: 0.79, EUR: 0.855, GBP: 1 };
export const CURRENCIES = ["TRY", "GBP", "USD", "EUR"];

export function toGbp(amount, currency) {
  return +(amount * (FX_TO_GBP[currency] || 1)).toFixed(2);
}
export function convert(amount, from, to) {
  const gbp = amount * (FX_TO_GBP[from] || 1);
  return +(gbp / (FX_TO_GBP[to] || 1)).toFixed(0);
}

// ---------------------------------------------------------------------------
// Universities (North Cyprus). campus_location placeholder; verified flag.
// METU-NCC intentionally left unverified to demo the admin-warning behaviour.
// ---------------------------------------------------------------------------
export const UNIVERSITIES = [
  { id: "u-emu", slug: "dogu-akdeniz-universitesi", short: "EMU / DAÜ",
    name_tr: "Doğu Akdeniz Üniversitesi", name_en: "Eastern Mediterranean University",
    city: "Gazimağusa", lat: 35.1442, lng: 33.9106, coordinates_verified: true, students: 20000 },
  { id: "u-neu", slug: "yakin-dogu-universitesi", short: "NEU / YDÜ",
    name_tr: "Yakın Doğu Üniversitesi", name_en: "Near East University",
    city: "Lefkoşa", lat: 35.2286, lng: 33.3200, coordinates_verified: true, students: 26000 },
  { id: "u-ciu", slug: "uluslararasi-kibris-universitesi", short: "CIU / UKÜ",
    name_tr: "Uluslararası Kıbrıs Üniversitesi", name_en: "Cyprus International University",
    city: "Lefkoşa", lat: 35.1560, lng: 33.4110, coordinates_verified: true, students: 15000 },
  { id: "u-final", slug: "final-international-university", short: "Final",
    name_tr: "Final Uluslararası Üniversitesi", name_en: "Final International University",
    city: "Girne", lat: 35.3364, lng: 33.3190, coordinates_verified: true, students: 6000 },
  { id: "u-gau", slug: "girne-amerikan-universitesi", short: "GAU",
    name_tr: "Girne Amerikan Üniversitesi", name_en: "Girne American University",
    city: "Girne", lat: 35.3400, lng: 33.3150, coordinates_verified: true, students: 12000 },
  { id: "u-kyrenia", slug: "girne-universitesi", short: "UoK",
    name_tr: "Girne Üniversitesi", name_en: "University of Kyrenia",
    city: "Girne", lat: 35.3410, lng: 33.3100, coordinates_verified: true, students: 8000 },
  { id: "u-metu", slug: "odtu-kuzey-kibris", short: "METU NCC",
    name_tr: "ODTÜ Kuzey Kıbrıs Kampüsü", name_en: "METU Northern Cyprus Campus",
    city: "Güzelyurt", lat: 35.1420, lng: 32.9700, coordinates_verified: false, students: 3500 },
];

const PHOTOS = {
  hero: "https://images.unsplash.com/photo-1579963824000-7d7b70b2f7a3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwxfHxNZWRpdGVycmFuZWFuJTIwYXBhcnRtZW50fGVufDB8fHxibHVlfDE3ODcyNDk0ODl8MA&ixlib=rb-4.1.0&q=85",
  building: "https://images.unsplash.com/photo-1468649437954-f86751c119b6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwyfHxNZWRpdGVycmFuZWFuJTIwYXBhcnRtZW50fGVufDB8fHxibHVlfDE3ODcyNDk0ODl8MA&ixlib=rb-4.1.0&q=85",
  i1: "https://images.unsplash.com/photo-1648877075369-f30525f7e51c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAxODF8MHwxfHNlYXJjaHwzfHxsaXZpbmclMjByb29tfGVufDB8fHxibHVlfDE3ODcyNDk0OTZ8MA&ixlib=rb-4.1.0&q=85",
  i2: "https://images.unsplash.com/photo-1653340871692-2df270811f8e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAxODF8MHwxfHNlYXJjaHwyfHxsaXZpbmclMjByb29tfGVufDB8fHxibHVlfDE3ODcyNDk0OTZ8MA&ixlib=rb-4.1.0&q=85",
  i3: "https://images.pexels.com/photos/7546648/pexels-photo-7546648.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  i4: "https://images.pexels.com/photos/280239/pexels-photo-280239.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  i5: "https://images.unsplash.com/photo-1586310520462-658e93388399?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzV8MHwxfHNlYXJjaHwzfHxiZWRyb29tfGVufDB8fHxibHVlfDE3ODcyNDk0OTZ8MA&ixlib=rb-4.1.0&q=85",
  i6: "https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  i7: "https://images.pexels.com/photos/34574606/pexels-photo-34574606.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  i8: "https://images.pexels.com/photos/8082562/pexels-photo-8082562.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  i9: "https://images.pexels.com/photos/33197293/pexels-photo-33197293.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  i10: "https://images.unsplash.com/photo-1492138645880-160f6a5136fa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzF8MHwxfHNlYXJjaHwxfHxhcGFydG1lbnQlMjBpbnRlcmlvcnxlbnwwfHx8Ymx1ZXwxNzg3MjQ5NDg5fDA&ixlib=rb-4.1.0&q=85",
};
const P = Object.values(PHOTOS);
export const HERO_IMAGE = PHOTOS.hero;

// Landlords / agencies
const LL = {
  ayse: { name: "Ayşe Yılmaz", is_agency: false, verified: true, phone: "+90 533 111 22 33" },
  mehmet: { name: "Mehmet Demir", is_agency: false, verified: true, phone: "+90 542 222 33 44" },
  kibris: { name: "Kıbrıs Home Emlak", is_agency: true, verified: true, phone: "+90 533 444 55 66", slug: "kibris-home-emlak" },
  girneprop: { name: "Girne Property Group", is_agency: true, verified: true, phone: "+90 548 555 66 77", slug: "girne-property-group" },
  newacc: { name: "Deniz K.", is_agency: false, verified: false, phone: "+90 539 777 88 99" },
};

function walk(distance_m) { return Math.round((distance_m / 4500) * 60); } // 4.5km/h

// Listings ------------------------------------------------------------------
export const LISTINGS = [
  {
    id: "l-1", reference_code: "A3F9K2", landlord: LL.ayse, uni: "u-emu", distance_m: 550,
    title_tr: "Final Üniversitesi'ne yakın 2 yatak odalı eşyalı daire",
    title_en: "Furnished 2-bedroom flat near Eastern Mediterranean University",
    description_tr: "Kampüse yürüme mesafesinde, yeni yenilenmiş, klimalı 2+1 daire. Öğrenciler için ideal, güvenli ve sakin bir bölgede.",
    description_en: "Recently renovated 2+1 flat with A/C, within walking distance of campus. Ideal for students, in a safe and quiet neighbourhood.",
    property_type: "apartment", bedrooms: 2, bathrooms: 1, furnished: true, size_sqm: 85, max_occupants: 3,
    gender_preference: "any", available_from: "2025-08-01", minimum_stay_months: 9,
    price: { amount: 480, currency: "GBP" }, deposit: { amount: 480, currency: "GBP" },
    bills_included: false, bills_note: "≈ £40/ay ortalama", agency_fee_note: "Komisyon: yok",
    amenities: ["wifi", "ac", "washing_machine", "balcony", "parking"],
    neighbourhood: "Sakarya", city: "Gazimağusa", featured: true, risk_flags: [],
    photos: [P[2], P[3], P[4], P[5]],
  },
  {
    id: "l-2", reference_code: "H7M4P8", landlord: LL.kibris, uni: "u-emu", distance_m: 1200,
    title_tr: "EMU yakını uygun fiyatlı stüdyo daire",
    title_en: "Affordable studio near EMU",
    description_tr: "Tek öğrenci için ideal stüdyo. Faturalar dahil, eşyalı ve temiz.",
    description_en: "Studio ideal for a single student. Bills included, furnished and clean.",
    property_type: "studio", bedrooms: 0, bathrooms: 1, furnished: true, size_sqm: 35, max_occupants: 1,
    gender_preference: "any", available_from: "2025-07-15", minimum_stay_months: 6,
    price: { amount: 11000, currency: "TRY" }, deposit: { amount: 11000, currency: "TRY" },
    bills_included: true, bills_note: "Su, elektrik, internet dahil", agency_fee_note: "Komisyon: 1 kira",
    amenities: ["wifi", "ac", "furnished_kitchen"],
    neighbourhood: "Karakol", city: "Gazimağusa", featured: true, risk_flags: [],
    photos: [P[10], P[8], P[6]],
  },
  {
    id: "l-3", reference_code: "R2X6B9", landlord: LL.girneprop, uni: "u-final", distance_m: 700,
    title_tr: "Girne'de deniz manzaralı 2+1 lüks daire",
    title_en: "Sea-view luxury 2+1 flat in Kyrenia",
    description_tr: "Final Üniversitesi'ne 10 dakika. Site içi, havuzlu, güvenlikli.",
    description_en: "10 minutes to Final University. Gated complex with pool and security.",
    property_type: "apartment", bedrooms: 2, bathrooms: 2, furnished: true, size_sqm: 95, max_occupants: 3,
    gender_preference: "any", available_from: "2025-09-01", minimum_stay_months: 12,
    price: { amount: 620, currency: "GBP" }, deposit: { amount: 620, currency: "GBP" },
    bills_included: false, bills_note: "Aidat dahil", agency_fee_note: "Komisyon: yok",
    amenities: ["wifi", "ac", "pool", "security", "parking", "balcony", "sea_view"],
    neighbourhood: "Karakum", city: "Girne", featured: true, risk_flags: [],
    photos: [P[1], P[2], P[7], P[3]],
  },
  {
    id: "l-4", reference_code: "K5N8T3", landlord: LL.mehmet, uni: "u-neu", distance_m: 900,
    title_tr: "Yakın Doğu Üniversitesi karşısı 1+1 daire",
    title_en: "1+1 flat opposite Near East University",
    description_tr: "Kampüsün tam karşısında, ulaşımı kolay, eşyalı 1+1.",
    description_en: "Directly opposite campus, easy transport, furnished 1+1.",
    property_type: "apartment", bedrooms: 1, bathrooms: 1, furnished: true, size_sqm: 55, max_occupants: 2,
    gender_preference: "female", available_from: "2025-08-15", minimum_stay_months: 9,
    price: { amount: 350, currency: "GBP" }, deposit: { amount: 350, currency: "GBP" },
    bills_included: false, bills_note: "", agency_fee_note: "Komisyon: yarım kira",
    amenities: ["wifi", "ac", "washing_machine", "elevator"],
    neighbourhood: "Yenikent", city: "Lefkoşa", featured: false, risk_flags: [],
    photos: [P[4], P[5], P[8]],
  },
  {
    id: "l-5", reference_code: "M9C2W7", landlord: LL.newacc, uni: "u-emu", distance_m: 400,
    title_tr: "ACİL! EMU yanı 3+1 ÇOK UCUZ daire - kaçırmayın",
    title_en: "URGENT! 3+1 flat next to EMU VERY CHEAP - don't miss",
    description_tr: "Çok acil kiralık. Kapora yatıran kişiye anahtar teslim. Ödemeyi WhatsApp'tan yapabilirsiniz.",
    description_en: "Very urgent rental. Keys handed to whoever pays a deposit first. You can pay via WhatsApp transfer.",
    property_type: "apartment", bedrooms: 3, bathrooms: 2, furnished: true, size_sqm: 110, max_occupants: 4,
    gender_preference: "any", available_from: "2025-07-01", minimum_stay_months: 6,
    price: { amount: 220, currency: "GBP" }, deposit: { amount: 440, currency: "GBP" },
    bills_included: true, bills_note: "Her şey dahil", agency_fee_note: "",
    amenities: ["wifi", "ac", "parking"],
    neighbourhood: "Tuzla", city: "Gazimağusa", featured: false,
    risk_flags: ["price_below_p25", "new_account_bulk", "contact_in_text", "payment_in_text"],
    photos: [P[2], P[6]],
  },
  {
    id: "l-6", reference_code: "B4Q7L1", landlord: LL.kibris, uni: "u-ciu", distance_m: 1500,
    title_tr: "CIU'ya yakın 2+1 bahçeli müstakil kat",
    title_en: "2+1 garden apartment near CIU",
    description_tr: "Bahçe kullanımlı, geniş, aileler ve öğrenci grupları için uygun.",
    description_en: "With garden access, spacious, suitable for families and student groups.",
    property_type: "apartment", bedrooms: 2, bathrooms: 1, furnished: false, size_sqm: 100, max_occupants: 4,
    gender_preference: "any", available_from: "2025-08-01", minimum_stay_months: 12,
    price: { amount: 15000, currency: "TRY" }, deposit: { amount: 30000, currency: "TRY" },
    bills_included: false, bills_note: "", agency_fee_note: "Komisyon: 1 kira",
    amenities: ["garden", "parking", "ac"],
    neighbourhood: "Haspolat", city: "Lefkoşa", featured: false, risk_flags: [],
    photos: [P[3], P[4], P[7]],
  },
  {
    id: "l-7", reference_code: "T8V3Z5", landlord: LL.girneprop, uni: "u-gau", distance_m: 600,
    title_tr: "GAU yakını modern stüdyo - öğrenci sitesi",
    title_en: "Modern studio near GAU - student residence",
    description_tr: "Öğrenci sitesinde, jimnastik salonu ve ortak çalışma alanı olan modern stüdyo.",
    description_en: "In a student residence with gym and shared study area. Modern studio.",
    property_type: "studio", bedrooms: 0, bathrooms: 1, furnished: true, size_sqm: 40, max_occupants: 1,
    gender_preference: "any", available_from: "2025-09-01", minimum_stay_months: 9,
    price: { amount: 450, currency: "USD" }, deposit: { amount: 450, currency: "USD" },
    bills_included: true, bills_note: "İnternet ve aidat dahil", agency_fee_note: "Komisyon: yok",
    amenities: ["wifi", "ac", "gym", "study_room", "security"],
    neighbourhood: "Merkez", city: "Girne", featured: true, risk_flags: [],
    photos: [P[8], P[10], P[9]],
  },
  {
    id: "l-8", reference_code: "W6D9F2", landlord: LL.ayse, uni: "u-neu", distance_m: 300,
    title_tr: "NEU kampüs içi yürüme mesafesi 1+1",
    title_en: "1+1 within walking distance of NEU campus",
    description_tr: "Kampüse 4 dakika. Sessiz, çalışmaya uygun, eşyalı.",
    description_en: "4 minutes to campus. Quiet, study-friendly, furnished.",
    property_type: "apartment", bedrooms: 1, bathrooms: 1, furnished: true, size_sqm: 50, max_occupants: 2,
    gender_preference: "male", available_from: "2025-08-20", minimum_stay_months: 9,
    price: { amount: 400, currency: "EUR" }, deposit: { amount: 400, currency: "EUR" },
    bills_included: false, bills_note: "", agency_fee_note: "Komisyon: yarım kira",
    amenities: ["wifi", "ac", "washing_machine", "balcony"],
    neighbourhood: "Yenikent", city: "Lefkoşa", featured: false, risk_flags: [],
    photos: [P[5], P[4], P[3]],
  },
  {
    id: "l-9", reference_code: "N3G7H8", landlord: LL.kibris, uni: "u-emu", distance_m: 2000,
    title_tr: "Gazimağusa merkez 2+1 uygun fiyat",
    title_en: "Famagusta centre 2+1 good value",
    description_tr: "Merkeze ve markete yakın. Otobüs ile kampüse 10 dakika.",
    description_en: "Close to centre and market. 10 min to campus by bus.",
    property_type: "apartment", bedrooms: 2, bathrooms: 1, furnished: true, size_sqm: 80, max_occupants: 3,
    gender_preference: "any", available_from: "2025-07-25", minimum_stay_months: 9,
    price: { amount: 420, currency: "GBP" }, deposit: { amount: 420, currency: "GBP" },
    bills_included: false, bills_note: "", agency_fee_note: "Komisyon: 1 kira",
    amenities: ["wifi", "ac", "elevator", "parking"],
    neighbourhood: "Merkez", city: "Gazimağusa", featured: false, risk_flags: [],
    photos: [P[3], P[2], P[8]],
  },
  {
    id: "l-10", reference_code: "P1K4R6", landlord: LL.mehmet, uni: "u-final", distance_m: 1100,
    title_tr: "Girne'de öğrenciye özel 1+1 eşyalı",
    title_en: "Furnished 1+1 for students in Kyrenia",
    description_tr: "Final ve Girne Üniversitesi'ne yakın, dolmuş güzergahında.",
    description_en: "Near Final and University of Kyrenia, on the minibus route.",
    property_type: "apartment", bedrooms: 1, bathrooms: 1, furnished: true, size_sqm: 58, max_occupants: 2,
    gender_preference: "any", available_from: "2025-09-10", minimum_stay_months: 9,
    price: { amount: 480, currency: "GBP" }, deposit: { amount: 480, currency: "GBP" },
    bills_included: false, bills_note: "", agency_fee_note: "Komisyon: yok",
    amenities: ["wifi", "ac", "balcony", "parking"],
    neighbourhood: "Zeytinlik", city: "Girne", featured: false, risk_flags: [],
    photos: [P[4], P[5], P[7]],
  },
  {
    id: "l-11", reference_code: "S5T8U2", landlord: LL.girneprop, uni: "u-kyrenia", distance_m: 800,
    title_tr: "Girne Üniversitesi yakını 3+1 geniş daire",
    title_en: "Spacious 3+1 near University of Kyrenia",
    description_tr: "3-4 öğrenci için ideal, geniş salon ve iki banyo.",
    description_en: "Ideal for 3-4 students, large living room and two bathrooms.",
    property_type: "apartment", bedrooms: 3, bathrooms: 2, furnished: true, size_sqm: 120, max_occupants: 4,
    gender_preference: "any", available_from: "2025-08-05", minimum_stay_months: 12,
    price: { amount: 780, currency: "GBP" }, deposit: { amount: 780, currency: "GBP" },
    bills_included: false, bills_note: "", agency_fee_note: "Komisyon: yok",
    amenities: ["wifi", "ac", "parking", "balcony", "elevator", "security"],
    neighbourhood: "Karakum", city: "Girne", featured: false, risk_flags: [],
    photos: [P[1], P[3], P[4], P[7]],
  },
  {
    id: "l-12", reference_code: "V9W2X4", landlord: LL.ayse, uni: "u-ciu", distance_m: 650,
    title_tr: "CIU'ya yürüme mesafesi eşyalı stüdyo",
    title_en: "Furnished studio walking distance to CIU",
    description_tr: "Tek kişilik, temiz ve bakımlı stüdyo. Kampüse 9 dakika.",
    description_en: "Single-occupancy, clean and well-kept studio. 9 min to campus.",
    property_type: "studio", bedrooms: 0, bathrooms: 1, furnished: true, size_sqm: 32, max_occupants: 1,
    gender_preference: "female", available_from: "2025-07-30", minimum_stay_months: 6,
    price: { amount: 9500, currency: "TRY" }, deposit: { amount: 9500, currency: "TRY" },
    bills_included: false, bills_note: "", agency_fee_note: "Komisyon: yarım kira",
    amenities: ["wifi", "ac", "furnished_kitchen"],
    neighbourhood: "Haspolat", city: "Lefkoşa", featured: false, risk_flags: [],
    photos: [P[8], P[10], P[9]],
  },
  {
    id: "l-13", reference_code: "C7D2E5", landlord: LL.ayse, uni: "u-emu", distance_m: 700,
    room_share: true, flatmates: 2,
    title_tr: "EMU yakını 3+1 dairede kız öğrenciye oda (ev paylaşımı)",
    title_en: "Room for a female student in a shared 3+1 flat near EMU",
    description_tr: "Temiz ve düzenli 3+1 dairede tek kişilik özel oda. 2 kız öğrenciyle paylaşımlı. Ortak salon, mutfak ve internet dahil.",
    description_en: "Private single room in a clean, tidy 3+1 flat. Shared with 2 female students. Shared living room, kitchen and internet included.",
    property_type: "room", bedrooms: 1, bathrooms: 1, furnished: true, size_sqm: 16, max_occupants: 1,
    gender_preference: "female", available_from: "2025-08-10", minimum_stay_months: 6,
    price: { amount: 5500, currency: "TRY" }, deposit: { amount: 5500, currency: "TRY" },
    bills_included: true, bills_note: "Faturalar ve internet dahil", agency_fee_note: "Komisyon: yok",
    amenities: ["wifi", "ac", "washing_machine", "furnished_kitchen"],
    neighbourhood: "Karakol", city: "Gazimağusa", featured: true, risk_flags: [],
    photos: [P[5], P[7], P[3]],
  },
  {
    id: "l-14", reference_code: "F4G8H1", landlord: LL.mehmet, uni: "u-neu", distance_m: 850,
    room_share: true, flatmates: 1,
    title_tr: "NEU yakını erkek öğrenciye oda — ev arkadaşı aranıyor",
    title_en: "Room for a male student near NEU — flatmate wanted",
    description_tr: "2+1 dairede boşalan oda. 1 erkek öğrenciyle paylaşımlı, sakin ve çalışkan ev arkadaşı aranıyor.",
    description_en: "Room available in a 2+1 flat. Shared with 1 male student; looking for a quiet, studious flatmate.",
    property_type: "room", bedrooms: 1, bathrooms: 1, furnished: true, size_sqm: 14, max_occupants: 1,
    gender_preference: "male", available_from: "2025-09-01", minimum_stay_months: 9,
    price: { amount: 180, currency: "GBP" }, deposit: { amount: 180, currency: "GBP" },
    bills_included: false, bills_note: "Faturalar paylaşımlı (≈£25/ay)", agency_fee_note: "Komisyon: yok",
    amenities: ["wifi", "ac", "washing_machine", "balcony"],
    neighbourhood: "Yenikent", city: "Lefkoşa", featured: false, risk_flags: [],
    photos: [P[4], P[3], P[8]],
  },
  {
    id: "l-15", reference_code: "J6K3L9", landlord: LL.girneprop, uni: "u-gau", distance_m: 900,
    room_share: true, flatmates: 3,
    title_tr: "Girne'de öğrenci sitesinde paylaşımlı odada yatak",
    title_en: "Bed in a shared room in a student residence in Kyrenia",
    description_tr: "Öğrenci sitesinde, 4 kişilik dairede paylaşımlı oda. Havuz, güvenlik ve servis dahil. Bütçe dostu.",
    description_en: "Shared room in a 4-person flat in a student residence. Pool, security and shuttle included. Budget friendly.",
    property_type: "room", bedrooms: 1, bathrooms: 2, furnished: true, size_sqm: 12, max_occupants: 1,
    gender_preference: "any", available_from: "2025-09-05", minimum_stay_months: 9,
    price: { amount: 220, currency: "USD" }, deposit: { amount: 220, currency: "USD" },
    bills_included: true, bills_note: "Her şey dahil", agency_fee_note: "Komisyon: yok",
    amenities: ["wifi", "ac", "pool", "security", "gym", "study_room"],
    neighbourhood: "Merkez", city: "Girne", featured: false, risk_flags: [],
    photos: [P[9], P[8], P[10]],
  },
  {
    id: "l-16", reference_code: "M2N7P4", landlord: LL.kibris, uni: "u-ciu", distance_m: 1300,
    room_share: true, flatmates: 2,
    title_tr: "CIU yakını kız öğrenciye özel oda (ev paylaşımı)",
    title_en: "Private room for a female student near CIU (house share)",
    description_tr: "3+1 bahçeli dairede özel oda. 2 kız öğrenciyle paylaşımlı, bahçe ve otopark kullanımı.",
    description_en: "Private room in a 3+1 flat with garden. Shared with 2 female students; garden and parking access.",
    property_type: "room", bedrooms: 1, bathrooms: 1, furnished: true, size_sqm: 15, max_occupants: 1,
    gender_preference: "female", available_from: "2025-08-25", minimum_stay_months: 6,
    price: { amount: 6000, currency: "TRY" }, deposit: { amount: 6000, currency: "TRY" },
    bills_included: false, bills_note: "Faturalar paylaşımlı", agency_fee_note: "Komisyon: yok",
    amenities: ["wifi", "ac", "garden", "parking", "furnished_kitchen"],
    neighbourhood: "Haspolat", city: "Lefkoşa", featured: false, risk_flags: [],
    photos: [P[7], P[4], P[3]],
  },
];

// Attach computed GBP + price history + published date
LISTINGS.forEach((l, idx) => {
  l.price_gbp = toGbp(l.price.amount, l.price.currency);
  const base = l.price.amount;
  const d = new Date("2025-06-01");
  l.published_at = new Date(Date.now() - (idx + 2) * 86400000 * 3).toISOString();
  l.last_confirmed_available_at = new Date(Date.now() - (idx % 6) * 86400000).toISOString();
  l.view_count = 40 + idx * 17;
  l.contact_reveal_count = 3 + (idx % 5);
  // price history (append-only style)
  l.price_history = [
    { price: { amount: Math.round(base * 1.08), currency: l.price.currency },
      price_gbp: toGbp(Math.round(base * 1.08), l.price.currency),
      changed_at: new Date(d.getTime() - 120 * 86400000).toISOString() },
    { price: { amount: Math.round(base * 1.03), currency: l.price.currency },
      price_gbp: toGbp(Math.round(base * 1.03), l.price.currency),
      changed_at: new Date(d.getTime() - 60 * 86400000).toISOString() },
    { price: { amount: base, currency: l.price.currency },
      price_gbp: l.price_gbp,
      changed_at: new Date(d.getTime() - 10 * 86400000).toISOString() },
  ];
});

// ---------------------------------------------------------------------------
// Price index per (university, property_type, bedrooms) — figures in GBP
// Some buckets deliberately have sample_size < 5 to show "not enough data".
// ---------------------------------------------------------------------------
export const PRICE_INDEX = [
  { university_id: "u-emu", property_type: "apartment", bedrooms: 2, median_gbp: 460, p25_gbp: 400, p75_gbp: 540, sample_size: 8 },
  { university_id: "u-emu", property_type: "studio", bedrooms: 0, median_gbp: 275, p25_gbp: 240, p75_gbp: 320, sample_size: 6 },
  { university_id: "u-emu", property_type: "apartment", bedrooms: 3, median_gbp: 640, p25_gbp: 560, p75_gbp: 720, sample_size: 5 },
  { university_id: "u-neu", property_type: "apartment", bedrooms: 1, median_gbp: 360, p25_gbp: 300, p75_gbp: 420, sample_size: 7 },
  { university_id: "u-final", property_type: "apartment", bedrooms: 2, median_gbp: 640, p25_gbp: 540, p75_gbp: 760, sample_size: 6 },
  { university_id: "u-ciu", property_type: "apartment", bedrooms: 2, median_gbp: 380, p25_gbp: 330, p75_gbp: 440, sample_size: 5 },
  { university_id: "u-gau", property_type: "studio", bedrooms: 0, median_gbp: 340, p25_gbp: 300, p75_gbp: 400, sample_size: 4 }, // < 5
  { university_id: "u-kyrenia", property_type: "apartment", bedrooms: 3, median_gbp: 760, p25_gbp: 680, p75_gbp: 860, sample_size: 3 }, // < 5
  { university_id: "u-ciu", property_type: "studio", bedrooms: 0, median_gbp: 240, p25_gbp: 210, p75_gbp: 280, sample_size: 5 },
];

export function findIndex(uni, type, bedrooms) {
  return PRICE_INDEX.find(p => p.university_id === uni && p.property_type === type && p.bedrooms === bedrooms) || null;
}

// Compute price_index_ratio + risk flag for below-p25 at publish time
LISTINGS.forEach(l => {
  const pi = findIndex(l.uni, l.property_type, l.bedrooms);
  if (pi && pi.sample_size >= 5) {
    l.price_index_ratio = +(l.price_gbp / pi.median_gbp).toFixed(3);
    if (l.price_gbp < pi.p25_gbp * 0.6 && !l.risk_flags.includes("price_below_p25")) {
      l.risk_flags.push("price_below_p25");
    }
  } else {
    l.price_index_ratio = null;
  }
});

// Packages (paid offline by bank transfer, activated manually by admin)
export const PACKAGES = [
  { id: "pkg-starter", name: "Starter", target_role: "landlord", listing_quota: 3, featured_quota: 0, duration_days: 30, price: { amount: 500, currency: "TRY" } },
  { id: "pkg-pro", name: "Pro", target_role: "landlord", listing_quota: 15, featured_quota: 3, duration_days: 90, price: { amount: 2000, currency: "TRY" } },
  { id: "pkg-agency", name: "Agency", target_role: "agency", listing_quota: 60, featured_quota: 10, duration_days: 180, price: { amount: 6000, currency: "TRY" } },
];

export function publicListing(l) {
  // Strip landlord phone / exact coords for ungated responses (contact gating).
  const { landlord, lat, lng, ...rest } = l;
  return {
    ...rest,
    landlord_name: landlord.name,
    landlord_is_agency: landlord.is_agency,
    landlord_verified: landlord.verified,
    // approximate location only (jittered ~300m); never exact pin
    approx_lat: l.approx_lat ?? null,
    approx_lng: l.approx_lng ?? null,
    walking_minutes: walk(l.distance_m),
  };
}

export function getListingByRef(ref) {
  return LISTINGS.find(l => l.reference_code === ref) || null;
}
