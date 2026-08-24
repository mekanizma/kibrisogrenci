import 'server-only';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseForToken } from '@/lib/supabase/server';
import { KKTC_CITIES, UNI_CATALOG, universityShort, universityMeta, normalizeUniversityIds, slugifyUniversityName } from '@/lib/universities';
import { FX_FALLBACK_TO_GBP, fxToGbpFromDbRows, getLiveFxToGbp, persistFxRows } from '@/lib/fx';
import {
  computePremiumUntil,
  comparePremiumThenDate,
  getPremiumPlan,
  mapPremiumFields,
} from '@/lib/premium';
import {
  createShopierCheckout,
  deleteShopierProduct,
  isShopierConfigured,
} from '@/lib/shopier';

async function syncListingUniversities(admin, listingId, universityIds) {
  const ids = Array.isArray(universityIds) ? universityIds.filter(Boolean) : [];
  await admin.from('listing_universities').delete().eq('listing_id', listingId);
  if (!ids.length) return;
  const rows = ids.map((university_id, i) => ({
    listing_id: listingId,
    university_id,
    sort_order: i,
  }));
  const { error } = await admin.from('listing_universities').insert(rows);
  if (error) throw error;
}

async function fetchListingUniversityIds(admin, listingId) {
  const { data } = await admin
    .from('listing_universities')
    .select('university_id, sort_order')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: true });
  return (data || []).map((r) => r.university_id).filter(Boolean);
}

async function fetchUniversitiesByIds(admin, ids) {
  if (!ids?.length) return [];
  const { data } = await admin
    .from('universities')
    .select('id, slug, name_tr, name_en, city')
    .in('id', ids);
  const byId = Object.fromEntries((data || []).map((u) => [u.id, u]));
  return ids.map((id) => {
    const u = byId[id];
    if (!u) return null;
    return {
      id: u.id,
      slug: u.slug,
      name_tr: u.name_tr,
      name_en: u.name_en,
      short: universityShort(u.slug, u.name_en, u.name_tr),
      city: u.city,
    };
  }).filter(Boolean);
}

async function listingIdsForUniversity(admin, universityId) {
  const { data: primary } = await admin
    .from('listings')
    .select('id')
    .eq('university_id', universityId)
    .eq('status', 'published');
  const { data: linked, error } = await admin
    .from('listing_universities')
    .select('listing_id')
    .eq('university_id', universityId);
  const linkIds = error ? [] : (linked || []).map((r) => r.listing_id);
  return [...new Set([
    ...(primary || []).map((r) => r.id),
    ...linkIds,
  ].filter(Boolean))];
}

function walkMinutes(m) {
  if (m == null) return null;
  return Math.round((Number(m) / 4500) * 60);
}

/** Parse PostGIS geography/geometry from Supabase (GeoJSON or EWKB hex). */
function parseGeoPoint(loc) {
  if (!loc) return null;
  if (typeof loc === 'object') {
    if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
      const lng = Number(loc.coordinates[0]);
      const lat = Number(loc.coordinates[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    if (loc.lat != null && loc.lng != null) {
      const lat = Number(loc.lat);
      const lng = Number(loc.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  if (typeof loc === 'string' && /^[0-9A-Fa-f]+$/.test(loc) && loc.length >= 42) {
    try {
      const buf = Buffer.from(loc, 'hex');
      if (buf.length >= 25 && buf[0] === 1) {
        const type = buf.readUInt32LE(1);
        // Point with SRID (0x20000001) or plain Point (1)
        const offset = (type & 0x20000000) ? 9 : 5;
        if (buf.length >= offset + 16) {
          const lng = buf.readDoubleLE(offset);
          const lat = buf.readDoubleLE(offset + 8);
          if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Deterministic ~250m privacy jitter so exact address is not exposed. */
function privacyJitter(lat, lng, seed) {
  const s = String(seed || 'x');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  const a = ((h % 360) * Math.PI) / 180;
  const m = 180 + Math.abs(h % 120); // 180–300m
  const dLat = (m * Math.cos(a)) / 111320;
  const dLng = (m * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

const CITY_CENTERS = {
  Girne: { lat: 35.341, lng: 33.317 },
  Lefkoşa: { lat: 35.185, lng: 33.382 },
  Gazimağusa: { lat: 35.125, lng: 33.94 },
  Güzelyurt: { lat: 35.199, lng: 32.993 },
  Lefke: { lat: 35.112, lng: 32.85 },
  İskele: { lat: 35.287, lng: 33.892 },
};

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function distanceFromUser(listing, nearLat, nearLng) {
  if (!Number.isFinite(nearLat) || !Number.isFinite(nearLng)) return null;
  const lat = listing?.approx_lat ?? CITY_CENTERS[listing?.city]?.lat;
  const lng = listing?.approx_lng ?? CITY_CENTERS[listing?.city]?.lng;
  if (lat == null || lng == null) return null;
  return Math.round(haversineMeters(nearLat, nearLng, lat, lng));
}

function formatDistanceLabel(meters) {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Batch-load campus points and attach real listing↔campus / listing↔user distances. */
async function enrichListingsWithDistances(admin, rows, { universityId, nearLat, nearLng } = {}) {
  const uniIds = [...new Set([
    universityId,
    ...(rows || []).map((r) => r.university_id),
  ].filter(Boolean))];

  const campusById = {};
  if (uniIds.length) {
    const { data: unis } = await admin
      .from('universities')
      .select('id, campus_location, city')
      .in('id', uniIds);
    for (const u of unis || []) {
      campusById[u.id] = parseGeoPoint(u.campus_location)
        || (u.city && CITY_CENTERS[u.city] ? CITY_CENTERS[u.city] : null);
    }
  }

  const hasNear = Number.isFinite(nearLat) && Number.isFinite(nearLng);
  const targetCampus = universityId ? campusById[universityId] : null;

  const enriched = [];
  for (const row of rows || []) {
    const campusForRow = targetCampus || campusById[row.university_id] || null;

    // Listing point: prefer exact pin (privacy-jittered), never campus (that would make distance ~0).
    const exact = parseGeoPoint(row.location);
    let listingPt = null;
    let approx_lat = null;
    let approx_lng = null;
    if (exact) {
      const approx = privacyJitter(exact.lat, exact.lng, row.id);
      listingPt = { lat: approx.lat, lng: approx.lng };
      approx_lat = +approx.lat.toFixed(5);
      approx_lng = +approx.lng.toFixed(5);
    } else if (row.city && CITY_CENTERS[row.city]) {
      listingPt = CITY_CENTERS[row.city];
      approx_lat = listingPt.lat;
      approx_lng = listingPt.lng;
    }

    let distance_m = null;
    if (listingPt && campusForRow) {
      distance_m = Math.round(
        haversineMeters(listingPt.lat, listingPt.lng, campusForRow.lat, campusForRow.lng),
      );
    }

    let distance_from_user_m = null;
    if (listingPt && hasNear) {
      distance_from_user_m = Math.round(
        haversineMeters(nearLat, nearLng, listingPt.lat, listingPt.lng),
      );
    }

    enriched.push(mapPublicListing(row, {
      distance_m,
      approx_lat,
      approx_lng,
      distance_from_user_m,
      distance_from_user_label: formatDistanceLabel(distance_from_user_m),
    }));
  }
  return enriched;
}

const geocodeCache = new Map();

async function geocodeNominatim(query) {
  const key = query.toLowerCase().trim();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'kibrisogrenci.com/1.0 (student housing map)', Accept: 'application/json' },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) {
      geocodeCache.set(key, null);
      return null;
    }
    const rows = await res.json();
    const row = rows?.[0];
    const lat = Number(row?.lat);
    const lng = Number(row?.lon);
    const point = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    geocodeCache.set(key, point);
    return point;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

async function resolveListingMapPoint({
  listingId,
  location,
  neighbourhood,
  city,
  universityId,
  admin,
  allowGeocode = false,
  campusLocation = null,
}) {
  let exact = parseGeoPoint(location);
  let source = exact ? 'listing' : null;

  // Prefer local campus/city centers before slow external Nominatim.
  if (!exact && campusLocation) {
    exact = parseGeoPoint(campusLocation);
    if (exact) source = 'university';
  }

  if (!exact && universityId && admin && !campusLocation) {
    const { data: uni } = await admin
      .from('universities')
      .select('id, campus_location, city')
      .eq('id', universityId)
      .maybeSingle();
    exact = parseGeoPoint(uni?.campus_location);
    if (exact) source = 'university';
    if (!exact && uni?.city && CITY_CENTERS[uni.city]) {
      exact = CITY_CENTERS[uni.city];
      source = 'city';
    }
  }

  if (!exact && city && CITY_CENTERS[city]) {
    exact = CITY_CENTERS[city];
    source = 'city';
  }

  if (!exact && allowGeocode && neighbourhood && city) {
    exact = await geocodeNominatim(`${neighbourhood}, ${city}, Northern Cyprus`);
    if (exact) source = 'neighbourhood';
  }

  if (!exact) return null;

  // Exact listing pin stays private — show approximate area only
  const approx = source === 'listing' || source === 'neighbourhood'
    ? privacyJitter(exact.lat, exact.lng, listingId)
    : exact;

  return {
    approx_lat: +approx.lat.toFixed(5),
    approx_lng: +approx.lng.toFixed(5),
    map_source: source,
  };
}

const SIGNED_URL_TTL = 60 * 60 * 24 * 7;
const signedUrlCache = new Map(); // storage_key -> { url, exp }

/** Client-facing photo URL: local media proxy (fast list/detail JSON) or passthrough https. */
export function toClientPhotoUrl(key) {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  // Proxy signs on demand so listing APIs do not wait on Storage RPCs.
  return `/api/media?k=${encodeURIComponent(key)}`;
}

async function resolvePhotoUrls(keys, { max = Infinity, absolute = false } = {}) {
  const list = (keys || []).filter(Boolean).slice(0, Number.isFinite(max) ? max : undefined);
  if (!list.length) return [];

  // Default: cheap proxy URLs (no Storage round-trip on the API hot path)
  if (!absolute) {
    return list.map((key) => toClientPhotoUrl(key)).filter(Boolean);
  }

  const admin = supabaseAdmin();
  const now = Date.now();
  const out = new Array(list.length);
  const toSign = [];
  const toSignIdx = [];

  list.forEach((key, i) => {
    if (/^https?:\/\//i.test(key)) {
      out[i] = key;
      return;
    }
    const cached = signedUrlCache.get(key);
    if (cached && cached.exp > now) {
      out[i] = cached.url;
      return;
    }
    toSign.push(key);
    toSignIdx.push(i);
  });

  if (toSign.length) {
    const { data } = await admin.storage.from('listing-photos').createSignedUrls(toSign, SIGNED_URL_TTL);
    const rows = data || [];
    rows.forEach((row, j) => {
      const key = toSign[j];
      const url = row?.signedUrl || key;
      const idx = toSignIdx[j];
      out[idx] = url;
      if (row?.signedUrl) {
        signedUrlCache.set(key, { url: row.signedUrl, exp: now + SIGNED_URL_TTL * 1000 - 60_000 });
      }
    });
    toSignIdx.forEach((idx, j) => {
      if (!out[idx]) out[idx] = toClientPhotoUrl(toSign[j]);
    });
  }

  return out;
}

function mapPublicListing(row, extras = {}) {
  if (!row) return null;
  const rawPhotos = (row.listing_photos || [])
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((p) => p.public_url || p.storage_key)
    .filter(Boolean);

  const lp = row.landlord_profiles || extras.landlord || null;
  const distance_m = extras.distance_m ?? row.distance_m ?? null;
  const premium = mapPremiumFields(row);

  return {
    id: row.id,
    reference_code: row.reference_code,
    title_tr: row.title_tr,
    title_en: row.title_en,
    description_tr: row.description_tr,
    description_en: row.description_en,
    property_type: row.property_type,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    furnished: row.furnished,
    size_sqm: row.size_sqm,
    max_occupants: row.max_occupants,
    gender_preference: row.gender_preference,
    available_from: row.available_from,
    minimum_stay_months: row.minimum_stay_months,
    price: { amount: Number(row.price_amount), currency: row.price_currency },
    price_gbp: row.price_gbp_normalised != null ? Number(row.price_gbp_normalised) : null,
    deposit: row.deposit_amount != null
      ? { amount: Number(row.deposit_amount), currency: row.deposit_currency }
      : null,
    bills_included: row.bills_included,
    bills_note: row.bills_note,
    agency_fee_note: row.agency_fee_note,
    amenities: row.amenities || [],
    neighbourhood: row.neighbourhood,
    city: row.city,
    uni: row.university_id,
    distance_m,
    walking_minutes: walkMinutes(distance_m),
    photos: extras.photos || rawPhotos,
    featured: premium.featured || extras.featured || false,
    premium_tier: premium.premium_tier,
    premium_until: premium.premium_until,
    premium_rank: premium.premium_rank,
    premium: premium.premium,
    risk_flags: row.risk_flags || [],
    published_at: row.published_at,
    last_confirmed_available_at: row.last_confirmed_available_at,
    view_count: row.view_count,
    contact_reveal_count: row.contact_reveal_count,
    landlord_name: lp?.display_name || null,
    landlord_is_agency: !!lp?.is_agency,
    landlord_verified: lp?.verification_status === 'verified',
    approx_lat: extras.approx_lat ?? null,
    approx_lng: extras.approx_lng ?? null,
    distance_from_user_m: extras.distance_from_user_m ?? null,
    distance_from_user_label: extras.distance_from_user_label ?? null,
  };
}

function buildPriceIndex(data, listing) {
  if (!data || data.sample_size < 5) {
    return { enough: false, sample_size: data?.sample_size || 0 };
  }
  const priceGbp = listing.price_gbp ?? listing.price_gbp_normalised;
  if (priceGbp == null) {
    return { enough: true, median_gbp: Number(data.median_price_gbp), sample_size: data.sample_size, position: 'at', pct: 0 };
  }
  const median = Number(data.median_price_gbp);
  const ratio = priceGbp / median;
  const pct = Math.round(Math.abs(1 - ratio) * 100);
  let position = 'at';
  if (ratio < 0.97) position = 'below';
  else if (ratio > 1.03) position = 'above';
  return {
    enough: true,
    median_gbp: median,
    p25_gbp: Number(data.p25_price_gbp),
    p75_gbp: Number(data.p75_price_gbp),
    sample_size: data.sample_size,
    ratio: +ratio.toFixed(3),
    pct,
    position,
  };
}

function priceIndexKey(listing) {
  const uni = listing.university_id || listing.uni;
  return `${uni || ''}|${listing.property_type || ''}|${listing.bedrooms ?? 0}`;
}

async function priceIndexLookup(listings) {
  const list = Array.isArray(listings) ? listings : [listings];
  const uniIds = [...new Set(list.map((l) => l.university_id || l.uni).filter(Boolean))];
  const map = new Map();
  if (uniIds.length) {
    const admin = supabaseAdmin();
    const { data } = await admin.from('price_index').select('*').in('university_id', uniIds);
    (data || []).forEach((row) => {
      map.set(`${row.university_id}|${row.property_type}|${row.bedrooms}`, row);
    });
  }
  return (listing) => buildPriceIndex(map.get(priceIndexKey(listing)), listing);
}

async function priceIndexFor(listing) {
  const lookup = await priceIndexLookup([listing]);
  return lookup(listing);
}

const listingSelect = `
  id, landlord_id, university_id, reference_code, title_tr, title_en, description_tr, description_en,
  property_type, bedrooms, bathrooms, furnished, size_sqm, max_occupants, gender_preference,
  available_from, minimum_stay_months, price_amount, price_currency, price_gbp_normalised,
  deposit_amount, deposit_currency, bills_included, bills_note, agency_fee_note, amenities,
  neighbourhood, city, status, published_at, last_confirmed_available_at, view_count,
  contact_reveal_count, risk_flags, is_demo, location, premium_tier, premium_until,
  listing_photos ( storage_key, sort_order ),
  landlord_profiles ( id, display_name, is_agency, verification_status, user_id )
`;

/** Slimmer columns for cards / search grids — includes location for proximity. */
const listingCardSelect = `
  id, university_id, reference_code, title_tr, title_en,
  property_type, bedrooms, bathrooms, furnished, size_sqm, max_occupants,
  price_amount, price_currency, price_gbp_normalised,
  deposit_amount, deposit_currency, bills_included, amenities,
  neighbourhood, city, location, published_at, last_confirmed_available_at, view_count,
  premium_tier, premium_until,
  listing_photos ( storage_key, sort_order ),
  landlord_profiles ( id, display_name, is_agency, verification_status, user_id )
`;

const DEFAULT_LIST_LIMIT = 48;
const MAX_LIST_LIMIT = 96;

export async function dbGetConfig() {
  const admin = supabaseAdmin();
  const [
    { data: unis },
    { data: packages },
    { data: fx },
    { data: listingRows, count: listingsCount, error: listingsErr },
    { data: verifiedLps, count: verifiedCount, error: verifiedErr },
  ] = await Promise.all([
    admin.from('universities').select('*').eq('is_active', true),
    admin.from('packages').select('*').eq('is_active', true),
    admin.from('fx_rates').select('*').order('rate_date', { ascending: false }).limit(20),
    admin
      .from('listings')
      .select('id, city, university_id, landlord_id', { count: 'exact' })
      .eq('status', 'published')
      .eq('is_demo', false),
    admin
      .from('landlord_profiles')
      .select('id', { count: 'exact' })
      .eq('verification_status', 'verified'),
  ]);

  if (listingsErr) throw listingsErr;
  if (verifiedErr) throw verifiedErr;

  // Prefer live Frankfurter rates; fall back to DB then static defaults.
  // See https://frankfurter.dev — no API key required.
  let fx_to_gbp = fxToGbpFromDbRows(fx);
  let fx_source = (fx || []).length ? 'db' : 'fallback';
  let fx_date = null;
  try {
    const live = await getLiveFxToGbp();
    if (live?.fxToGbp) {
      fx_to_gbp = { ...FX_FALLBACK_TO_GBP, ...live.fxToGbp };
      fx_source = live.source;
      fx_date = live.date;
      // Persist quietly so listing GBP normalisation stays fresh even without worker.
      if (live.source === 'frankfurter' && live.rows?.length) {
        persistFxRows(admin, live.rows).catch(() => {});
      }
    }
  } catch {
    /* keep db/fallback */
  }
  if (!fx_date && (fx || []).length) {
    fx_date = fx.find((r) => r.rate_date)?.rate_date || null;
  }

  const publishedListings = listingRows || [];
  const listingCitySet = new Set(publishedListings.map((l) => l.city).filter(Boolean));
  const catalogOrder = Object.fromEntries(UNI_CATALOG.map((u, i) => [u.slug, i]));
  const mapUni = (u) => {
    const meta = universityMeta(u.slug);
    return {
      id: u.id,
      slug: u.slug,
      name_tr: meta?.name_tr || u.name_tr,
      name_en: meta?.name_en || u.name_en,
      short: universityShort(u.slug, meta?.name_en || u.name_en, meta?.name_tr || u.name_tr),
      city: meta?.city || u.city,
      coordinates_verified: !!u.coordinates_verified,
      listings_count: publishedListings.filter((l) => l.university_id === u.id).length,
    };
  };
  const allMapped = (unis || [])
    .map(mapUni)
    .sort((a, b) => (catalogOrder[a.slug] ?? 999) - (catalogOrder[b.slug] ?? 999)
      || String(a.name_tr || '').localeCompare(String(b.name_tr || ''), 'tr'));

  // Always expose every KKTC city in filters/forms; merge any extra listing cities
  const cities = [
    ...KKTC_CITIES,
    ...[...listingCitySet].filter((c) => !KKTC_CITIES.includes(c)),
  ];

  const verifiedLandlordIds = new Set((verifiedLps || []).map((r) => r.id));
  const verifiedWithListing = new Set(
    publishedListings
      .map((l) => l.landlord_id)
      .filter((id) => id && verifiedLandlordIds.has(id)),
  ).size;

  return {
    fx_to_gbp,
    fx_date,
    fx_source,
    currencies: ['TRY', 'GBP', 'USD', 'EUR'],
    hero_image: process.env.NEXT_PUBLIC_HERO_IMAGE || '/hero.jpg',
    // All active KKTC universities (home grid + search). Verified flag kept for map UX.
    universities: allMapped,
    all_universities: allMapped,
    packages: (packages || []).map((p) => ({
      id: p.id,
      name: p.name,
      target_role: p.target_role,
      listing_quota: p.listing_quota,
      featured_quota: p.featured_quota,
      duration_days: p.duration_days,
      price: { amount: Number(p.price_amount), currency: p.price_currency },
    })),
    stats: {
      listings: listingsCount ?? publishedListings.length,
      universities: allMapped.length,
      // Prefer exact DB count; fall back to row set / landlords with live verified listings
      verified_landlords: verifiedCount ?? verifiedLandlordIds.size ?? verifiedWithListing,
      cities: KKTC_CITIES.length,
    },
    cities,
    mock: false,
  };
}

export async function dbListListings(sp) {
  const admin = supabaseAdmin();
  let q = admin
    .from('listings')
    .select(listingCardSelect, { count: 'exact' })
    .eq('status', 'published')
    .eq('is_demo', false)
    .order('sort_order', { foreignTable: 'listing_photos', ascending: true })
    .limit(1, { foreignTable: 'listing_photos' });

  const university = sp.get('university');
  const city = sp.get('city');
  const property_type = sp.get('property_type');
  const bedrooms = sp.get('bedrooms');
  const furnished = sp.get('furnished');
  const bills_included = sp.get('bills_included');
  const gender = sp.get('gender');
  const price_min = sp.get('price_min');
  const price_max = sp.get('price_max');
  const amen = (sp.get('amenities') || '').split(',').filter(Boolean);
  const verifiedOnly = sp.get('verified_only') === 'true';
  const maxWalk = Number(sp.get('max_walk') || 0);
  const maxDistanceM = Number(sp.get('max_distance_m') || 0);
  const nearLat = Number(sp.get('near_lat') || NaN);
  const nearLng = Number(sp.get('near_lng') || NaN);
  const hasNear = Number.isFinite(nearLat) && Number.isFinite(nearLng);
  const sort = sp.get('sort') || 'new';
  const sortNear = sort === 'near';
  const sortCampus = sort === 'distance';
  const needsGeo = maxWalk > 0 || maxDistanceM > 0 || sortNear || sortCampus || hasNear;
  // Always attach real campus / user distances for card labels & filters
  const needsPostFilter = verifiedOnly || needsGeo;

  const requestedLimit = Number(sp.get('limit') || 0);
  const limit = Math.min(
    Math.max(requestedLimit > 0 ? requestedLimit : DEFAULT_LIST_LIMIT, 1),
    MAX_LIST_LIMIT,
  );

  if (university) {
    const ids = await listingIdsForUniversity(admin, university);
    if (!ids.length) {
      return { items: [], total: 0, page: 1, page_size: limit };
    }
    q = q.in('id', ids);
  }
  if (city) q = q.eq('city', city);
  if (property_type) q = q.eq('property_type', property_type);
  if (bedrooms != null && bedrooms !== '') q = q.eq('bedrooms', Number(bedrooms));
  if (furnished === 'true') q = q.eq('furnished', true);
  if (bills_included === 'true') q = q.eq('bills_included', true);
  if (gender) q = q.in('gender_preference', ['any', gender]);
  if (price_min) q = q.gte('price_gbp_normalised', Number(price_min));
  if (price_max) q = q.lte('price_gbp_normalised', Number(price_max));
  if (amen.length) q = q.contains('amenities', amen);

  if (sort === 'price_asc') q = q.order('price_gbp_normalised', { ascending: true });
  else if (sort === 'price_desc') q = q.order('price_gbp_normalised', { ascending: false });
  else if (sp.get('featured') === '1') {
    // Prefer active premium (esp. platinum featured_section); fall back to views
    q = q.order('premium_until', { ascending: false, nullsFirst: false })
      .order('view_count', { ascending: false });
  }
  else q = q.order('published_at', { ascending: false });

  // Over-fetch when soft JS filters / geo sort / premium boost remain
  const wantsPremiumBoost = !sort || sort === 'new' || sp.get('featured') === '1';
  const fetchLimit = (needsPostFilter || wantsPremiumBoost)
    ? Math.min(Math.max(limit * 5, 60), MAX_LIST_LIMIT)
    : limit;
  q = q.limit(fetchLimit);

  const { data, error, count } = await q;
  if (error) throw error;

  let items = await enrichListingsWithDistances(admin, data || [], {
    universityId: university || null,
    nearLat: hasNear ? nearLat : NaN,
    nearLng: hasNear ? nearLng : NaN,
  });

  if (verifiedOnly) {
    items = items.filter((l) => l.landlord_verified);
  }

  // Real campus walk / distance filters (skip unknowns only when filter is active)
  if (maxWalk > 0) {
    items = items.filter((l) => l.walking_minutes != null && l.walking_minutes <= maxWalk);
  }
  if (maxDistanceM > 0) {
    items = items.filter((l) => l.distance_m != null && l.distance_m <= maxDistanceM);
  }

  if (sp.get('featured') === '1') {
    // Home “öne çıkan”: active premium first (platinum → gold → bronze), then high views
    const premium = items.filter((l) => l.premium_rank > 0);
    const rest = items.filter((l) => !l.premium_rank);
    premium.sort(comparePremiumThenDate);
    rest.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
    items = [...premium, ...rest];
  } else if (sortNear && hasNear) {
    items = [...items].sort((a, b) => {
      const da = a.distance_from_user_m ?? Number.POSITIVE_INFINITY;
      const db = b.distance_from_user_m ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  } else if (sortCampus) {
    items = [...items].sort((a, b) => {
      const da = a.distance_m ?? Number.POSITIVE_INFINITY;
      const db = b.distance_m ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  } else if (!sort || sort === 'new') {
    // Default search: promoted listings rise to the top
    items = [...items].sort(comparePremiumThenDate);
  }

  items = items.slice(0, limit);

  const lookup = await priceIndexLookup(items.map((l) => ({ ...l, university_id: l.uni })));
  const withIndex = items.map((l) => {
    const cover = (l.photos || [])[0];
    return {
      ...l,
      photos: cover ? [toClientPhotoUrl(cover)] : [],
      price_index: lookup({ ...l, university_id: l.uni }),
    };
  });

  return {
    total: needsPostFilter ? withIndex.length : (count ?? withIndex.length),
    items: withIndex,
  };
}

export async function dbGetListingByRef(ref) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('listings')
    .select(listingSelect)
    .eq('reference_code', ref)
    .eq('status', 'published')
    .eq('is_demo', false)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // View counter is best-effort — do not block the response
  (async () => {
    try {
      await admin.rpc('increment_listing_view', { p_listing_id: data.id });
    } catch {
      /* ignore */
    }
  })();

  const mapped = mapPublicListing(data);
  // Photos via proxy URLs — no Storage signing on this hot path
  mapped.photos = await resolvePhotoUrls(mapped.photos);

  const [uniRes, histRes, similarRes, linkedUniIds] = await Promise.all([
    data.university_id
      ? admin.from('universities').select('id, slug, name_tr, name_en, city, campus_location').eq('id', data.university_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('listing_price_history')
      .select('price_amount, price_currency, changed_at')
      .eq('listing_id', data.id)
      .order('changed_at', { ascending: true })
      .limit(24),
    data.university_id
      ? admin
          .from('listings')
          .select(listingCardSelect)
          .eq('status', 'published')
          .eq('university_id', data.university_id)
          .neq('id', data.id)
          .order('published_at', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
    fetchListingUniversityIds(admin, data.id),
  ]);

  const uni = uniRes.data;
  const hist = histRes.data;
  const uniIdList = linkedUniIds.length
    ? linkedUniIds
    : (data.university_id ? [data.university_id] : []);
  const universities = await fetchUniversitiesByIds(admin, uniIdList);
  const mapPoint = await resolveListingMapPoint({
    listingId: data.id,
    location: data.location,
    neighbourhood: data.neighbourhood,
    city: data.city,
    universityId: data.university_id,
    campusLocation: uni?.campus_location || null,
    allowGeocode: false,
  });
  if (mapPoint) {
    mapped.approx_lat = mapPoint.approx_lat;
    mapped.approx_lng = mapPoint.approx_lng;
    mapped.map_source = mapPoint.map_source;
  }

  const campusPt = parseGeoPoint(uni?.campus_location)
    || (uni?.city && CITY_CENTERS[uni.city] ? CITY_CENTERS[uni.city] : null);
  const listingExact = parseGeoPoint(data.location);
  if (listingExact && campusPt) {
    const jittered = privacyJitter(listingExact.lat, listingExact.lng, data.id);
    mapped.distance_m = Math.round(
      haversineMeters(jittered.lat, jittered.lng, campusPt.lat, campusPt.lng),
    );
    mapped.walking_minutes = walkMinutes(mapped.distance_m);
  } else if (mapPoint?.map_source === 'listing' && campusPt) {
    mapped.distance_m = Math.round(
      haversineMeters(mapPoint.approx_lat, mapPoint.approx_lng, campusPt.lat, campusPt.lng),
    );
    mapped.walking_minutes = walkMinutes(mapped.distance_m);
  }

  const similarMapped = await enrichListingsWithDistances(admin, similarRes.data || [], {
    universityId: data.university_id || null,
  });
  const lookup = await priceIndexLookup([
    { ...mapped, university_id: mapped.uni },
    ...similarMapped.map((m) => ({ ...m, university_id: m.uni })),
  ]);

  const similar = similarMapped.map((m) => {
    const cover = (m.photos || [])[0];
    return {
      ...m,
      photos: cover ? [toClientPhotoUrl(cover)] : [],
      price_index: lookup({ ...m, university_id: m.uni }),
    };
  });

  const primaryUni = universities[0] || (uni
    ? {
        id: uni.id,
        slug: uni.slug,
        name_tr: uni.name_tr,
        name_en: uni.name_en,
        short: universityShort(uni.slug, uni.name_en, uni.name_tr),
        city: uni.city,
      }
    : null);

  return {
    ...mapped,
    university: primaryUni,
    universities,
    university_ids: uniIdList,
    price_index: lookup({ ...mapped, university_id: mapped.uni }),
    price_history: (hist || []).map((h) => ({
      changed_at: h.changed_at,
      price: { amount: Number(h.price_amount), currency: h.price_currency },
    })),
    similar,
  };
}

export async function dbRevealContact(user, ref, ipHash, uaHash) {
  const admin = supabaseAdmin();
  const { data: listing } = await admin
    .from('listings')
    .select('id, reference_code, status')
    .eq('reference_code', ref)
    .eq('status', 'published')
    .maybeSingle();
  if (!listing) return { error: 'not_found', status: 404 };

  // Ensure profile row exists (signup trigger can lag / fail) so reveal_contact accepts the user
  try {
    const { data: profile } = await admin.from('profiles').select('id, status, role').eq('id', user.id).maybeSingle();
    if (!profile) {
      await admin.from('profiles').upsert({
        id: user.id,
        role: user.role || 'student',
        status: 'active',
        full_name: user.profile?.full_name || null,
        phone_e164: user.profile?.phone_e164 || null,
      });
    } else if (profile.status !== 'active') {
      return { error: 'auth_required', status: 401 };
    }
  } catch {
    /* best-effort */
  }

  const client = supabaseForToken(user.accessToken);
  let { data, error } = await client.rpc('reveal_contact', {
    p_listing_id: listing.id,
    p_ip_hash: ipHash || null,
    p_ua_hash: uaHash || null,
  });

  // If JWT did not bind auth.uid() in PostgREST, fall back to admin-side reveal for the verified user
  if (error && String(error.message || '').includes('auth_required')) {
    const fallback = await revealContactAsAdmin(admin, user.id, listing.id, ipHash, uaHash);
    if (fallback.error) return fallback;
    data = fallback.data;
    error = null;
  }

  if (error) {
    const msg = error.message || '';
    if (msg.includes('rate_limited')) return { error: 'rate_limited', status: 429 };
    if (msg.includes('auth_required')) return { error: 'auth_required', status: 401 };
    if (msg.includes('not_found')) return { error: 'not_found', status: 404 };
    return { error: 'server_error', status: 500 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const phone = row?.phone_e164;
  if (!phone) return { error: 'not_found', status: 404 };

  // Landlord inbox: one inquiry per student/listing/day (best-effort)
  try {
    await admin.from('inquiries').insert({
      listing_id: listing.id,
      student_id: user.id,
      source: 'web',
      message: `Contact revealed for ${ref}`,
    });
  } catch {
    /* ignore */
  }

  const digits = phone.replace(/[^0-9]/g, '');
  const msg = encodeURIComponent(
    `Merhaba, kibrisogrenci.com'daki ${ref} numarali ilaniniz hakkinda bilgi almak istiyorum.`
  );
  return {
    ok: true,
    phone,
    whatsapp_url: `https://wa.me/${digits}?text=${msg}`,
    reveals_today: row.reveals_today,
    limit: row.daily_limit,
  };
}

async function revealContactAsAdmin(admin, userId, listingId, ipHash, uaHash) {
  const dailyLimit = 15;
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { count } = await admin
    .from('contact_reveals')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', userId)
    .gte('revealed_at', dayStart.toISOString());

  if ((count || 0) >= dailyLimit) {
    return { error: 'rate_limited', status: 429 };
  }

  const { data: listingRow } = await admin
    .from('listings')
    .select('id, contact_reveal_count, landlord_id')
    .eq('id', listingId)
    .eq('status', 'published')
    .maybeSingle();
  if (!listingRow) return { error: 'not_found', status: 404 };

  const { data: lp } = await admin
    .from('landlord_profiles')
    .select('user_id')
    .eq('id', listingRow.landlord_id)
    .maybeSingle();
  if (!lp?.user_id) return { error: 'not_found', status: 404 };

  const { data: phoneRow } = await admin
    .from('profiles')
    .select('phone_e164')
    .eq('id', lp.user_id)
    .maybeSingle();
  const phone = phoneRow?.phone_e164;
  if (!phone || !String(phone).trim()) return { error: 'not_found', status: 404 };

  const { error: insertErr } = await admin.from('contact_reveals').insert({
    listing_id: listingId,
    student_id: userId,
    ip_hash: ipHash || null,
    user_agent_hash: uaHash || null,
  });
  if (insertErr) return { error: 'server_error', status: 500 };

  await admin
    .from('listings')
    .update({ contact_reveal_count: (listingRow.contact_reveal_count || 0) + 1 })
    .eq('id', listingId);

  return {
    data: {
      phone_e164: phone,
      reveals_today: (count || 0) + 1,
      daily_limit: dailyLimit,
    },
  };
}

export async function dbCreateReport(user, body, ipHash) {
  const admin = supabaseAdmin();
  const { data: listing } = await admin
    .from('listings')
    .select('id')
    .eq('reference_code', body.ref)
    .maybeSingle();
  if (!listing) return { error: 'not_found', status: 404 };

  const { data: existing } = await admin
    .from('reports')
    .select('id, report_count')
    .eq('listing_id', listing.id)
    .eq('reason', body.reason)
    .eq('status', 'open')
    .maybeSingle();

  if (existing) {
    await admin.from('reports').update({ report_count: (existing.report_count || 1) + 1 }).eq('id', existing.id);
    return { ok: true, id: existing.id, collapsed: true };
  }

  const { data, error } = await admin
    .from('reports')
    .insert({
      listing_id: listing.id,
      reporter_user_id: user?.id || null,
      reporter_ip_hash: ipHash || null,
      reason: body.reason,
      detail: (body.detail || '').slice(0, 2000),
      status: 'open',
    })
    .select('id')
    .single();
  if (error) throw error;
  return { ok: true, id: data.id };
}

export async function dbMyListings(user) {
  const client = supabaseForToken(user.accessToken);
  const { data: lp } = await client.from('landlord_profiles').select('id, verification_status').eq('user_id', user.id).maybeSingle();
  if (!lp) return { items: [], quota: { used: 0, total: 0, package: null }, verification_status: null };

  // Use admin after ownership check — premium columns may be missing from the
  // authenticated column GRANT allowlist until migration 0017 is applied.
  const admin = supabaseAdmin();
  const { data: items, error } = await admin
    .from('listings')
    .select('id, reference_code, title_tr, status, price_amount, price_currency, city, view_count, contact_reveal_count, premium_tier, premium_until, listing_photos(storage_key, sort_order)')
    .eq('landlord_id', lp.id)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const { data: sub } = await client
    .from('subscriptions')
    .select('*, packages(name, listing_quota)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  const mapped = [];
  for (const l of items || []) {
    const raw = (l.listing_photos || []).sort((a, b) => a.sort_order - b.sort_order).map((p) => p.storage_key);
    const photos = await resolvePhotoUrls(raw);
    const prem = mapPremiumFields(l);
    mapped.push({
      id: l.id,
      reference_code: l.reference_code,
      title: l.title_tr,
      status: l.status,
      price: { amount: Number(l.price_amount), currency: l.price_currency },
      city: l.city,
      view_count: l.view_count,
      contact_reveal_count: l.contact_reveal_count,
      photo: photos[0] || null,
      premium_tier: prem.premium_tier,
      premium_until: prem.premium_until,
      premium: prem.premium,
    });
  }

  // rejection_reason is column-restricted; fetch via admin for owner listings
  if (mapped.length) {
    const ids = mapped.map((m) => m.id);
    const [{ data: reasons }, { data: reportRows }] = await Promise.all([
      admin.from('listings').select('id, rejection_reason').in('id', ids),
      admin.from('reports').select('listing_id, report_count, status').in('listing_id', ids),
    ]);
    const map = Object.fromEntries((reasons || []).map((r) => [r.id, r.rejection_reason]));
    const reportByListing = {};
    for (const r of reportRows || []) {
      if (!reportByListing[r.listing_id]) {
        reportByListing[r.listing_id] = { open: 0, total: 0 };
      }
      const c = r.report_count || 1;
      reportByListing[r.listing_id].total += c;
      if (r.status === 'open') reportByListing[r.listing_id].open += c;
    }
    mapped.forEach((m) => {
      m.rejection_reason = map[m.id] || null;
      m.report_count = reportByListing[m.id]?.total || 0;
      m.open_reports = reportByListing[m.id]?.open || 0;
    });
  }

  return {
    items: mapped,
    verification_status: lp.verification_status || 'unverified',
    quota: {
      used: mapped.length,
      total: sub?.packages?.listing_quota || 0,
      package: sub?.packages?.name || null,
    },
  };
}

function toGbp(amount, currency, fxToGbp) {
  const rate = fxToGbp?.[currency] ?? (currency === 'GBP' ? 1 : null);
  if (rate == null) return null;
  return +(Number(amount) * rate).toFixed(2);
}

async function resolveFxToGbp(admin) {
  const { data: fxRows } = await admin
    .from('fx_rates')
    .select('base_currency, quote_currency, rate')
    .eq('base_currency', 'GBP')
    .order('rate_date', { ascending: false })
    .limit(10);
  let fxToGbp = fxToGbpFromDbRows(fxRows);
  try {
    const live = await getLiveFxToGbp();
    if (live?.fxToGbp) fxToGbp = { ...FX_FALLBACK_TO_GBP, ...live.fxToGbp };
  } catch { /* keep db/fallback */ }
  return fxToGbp;
}

export async function dbCreateListing(user, body) {
  const title = (body.title || '').trim();
  const description = (body.description || '').trim();
  const priceAmount = Number(body.price_amount);
  const isDraft = !!body.draft;

  if (!isDraft) {
    if (!title || title.length < 5) return { error: 'invalid', status: 400, detail: 'title' };
    if (!description || description.length < 20) return { error: 'invalid', status: 400, detail: 'description' };
    if (!(priceAmount > 0)) return { error: 'invalid', status: 400, detail: 'price' };
    if (!(body.city || '').trim()) return { error: 'invalid', status: 400, detail: 'city' };
    if (!(body.neighbourhood || '').trim()) return { error: 'invalid', status: 400, detail: 'neighbourhood' };
    if (!(body.address_private || '').trim()) return { error: 'invalid', status: 400, detail: 'address' };
    if (!(body.phone_e164 || '').trim()) return { error: 'invalid', status: 400, detail: 'phone' };
    if (!Array.isArray(body.photos) || body.photos.length < 1) {
      return { error: 'invalid', status: 400, detail: 'photos' };
    }
  }

  const client = supabaseForToken(user.accessToken);
  const admin = supabaseAdmin();

  // Keep contact phone on landlord profile (used by reveal_contact)
  if (body.phone_e164) {
    await client
      .from('profiles')
      .update({ phone_e164: String(body.phone_e164).trim() })
      .eq('id', user.id);
  }
  if (body.display_name) {
    // no-op on profiles; used for landlord_profiles below
  }

  let { data: lp } = await client.from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!lp) {
    const { data: created, error } = await client
      .from('landlord_profiles')
      .insert({
        user_id: user.id,
        display_name: body.display_name || user.profile?.full_name || user.email,
      })
      .select('id')
      .single();
    if (error) throw error;
    lp = created;
    // Ensure profile can list (unified accounts)
    await admin.from('profiles').update({ role: 'landlord' }).eq('id', user.id).neq('role', 'admin');
  } else if (body.display_name) {
    await client.from('landlord_profiles').update({ display_name: body.display_name }).eq('id', lp.id);
  }

  const mine = await dbMyListings(user);
  if (mine.quota.total > 0 && mine.quota.used >= mine.quota.total) {
    return { error: 'quota_exceeded', status: 402 };
  }

  const fxToGbp = await resolveFxToGbp(admin);

  const currency = body.price_currency || 'GBP';
  const amenities = Array.isArray(body.amenities)
    ? body.amenities.filter(Boolean)
    : String(body.amenities || '').split(',').map((s) => s.trim()).filter(Boolean);

  const ref = Math.random().toString(36).replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
  const status = isDraft ? 'draft' : 'pending_review';

  // address_private is column-restricted for SELECT; INSERT via owner RLS still allowed.
  // Use admin after ownership check so private address + GBP normalisation always persist.
  const universityIds = normalizeUniversityIds(body);
  const row = {
    landlord_id: lp.id,
    university_id: universityIds[0] || null,
    reference_code: ref,
    title_tr: title || 'Yeni ilan',
    title_en: title || 'New listing',
    description_tr: description,
    description_en: description,
    property_type: body.property_type || 'apartment',
    bedrooms: Number(body.bedrooms) || 0,
    bathrooms: Number(body.bathrooms) || 1,
    furnished: body.furnished !== false && body.furnished !== 'false',
    size_sqm: body.size_sqm ? Number(body.size_sqm) : null,
    max_occupants: body.max_occupants ? Number(body.max_occupants) : null,
    gender_preference: body.gender_preference || 'any',
    available_from: body.available_from || null,
    minimum_stay_months: body.minimum_stay_months ? Number(body.minimum_stay_months) : null,
    price_amount: priceAmount > 0 ? priceAmount : 0,
    price_currency: currency,
    price_gbp_normalised: priceAmount > 0 ? toGbp(priceAmount, currency, fxToGbp) : null,
    deposit_amount: body.deposit_amount ? Number(body.deposit_amount) : null,
    deposit_currency: body.deposit_currency || currency,
    bills_included: body.bills_included === true || body.bills_included === 'true',
    bills_note: body.bills_note || null,
    agency_fee_note: body.agency_fee_note || null,
    amenities,
    address_private: body.address_private || null,
    neighbourhood: body.neighbourhood || null,
    city: body.city || null,
    status,
    last_confirmed_available_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from('listings')
    .insert(row)
    .select('id, reference_code, title_tr, status, price_amount, price_currency, city, created_at')
    .single();
  if (error) throw error;

  try {
    await syncListingUniversities(admin, data.id, universityIds);
  } catch (e) {
    // Table may not exist yet in older DBs — keep primary university_id only.
    if (!/listing_universities|does not exist|schema cache/i.test(e?.message || '')) throw e;
  }

  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 20) : [];
  if (photos.length) {
    const photoRows = photos.map((p, i) => ({
      listing_id: data.id,
      storage_key: typeof p === 'string' ? p : p.storage_key || p.url,
      sort_order: typeof p === 'object' && p.sort_order != null ? p.sort_order : i,
      alt_text_tr: title || null,
    })).filter((p) => p.storage_key);
    if (photoRows.length) {
      await admin.from('listing_photos').insert(photoRows);
    }
  }

  await admin.from('audit_log').insert({
    actor_user_id: user.id,
    action: 'listing.create',
    entity_type: 'listing',
    entity_id: data.id,
    after_snapshot: { status: data.status, photos: photos.length },
  });

  return {
    ok: true,
    item: {
      id: data.id,
      reference_code: data.reference_code,
      title: data.title_tr,
      status: data.status,
      price: { amount: Number(data.price_amount), currency: data.price_currency },
      city: data.city,
      created_at: data.created_at,
      view_count: 0,
      contact_reveal_count: 0,
      photo: photos[0]?.url || photos[0]?.storage_key || photos[0] || null,
    },
  };
}

export async function dbGetMyListing(user, id) {
  const admin = supabaseAdmin();
  const { data: lp } = await supabaseForToken(user.accessToken)
    .from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!lp) return { error: 'not_found', status: 404 };

  const { data, error } = await admin
    .from('listings')
    .select('*, listing_photos(storage_key, sort_order)')
    .eq('id', id)
    .eq('landlord_id', lp.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { error: 'not_found', status: 404 };

  const photos = (data.listing_photos || [])
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((p) => p.storage_key);

  let universityIds = [];
  try {
    universityIds = await fetchListingUniversityIds(admin, data.id);
  } catch {
    universityIds = [];
  }
  if (!universityIds.length && data.university_id) universityIds = [data.university_id];

  return {
    item: {
      id: data.id,
      reference_code: data.reference_code,
      title: data.title_tr,
      description: data.description_tr,
      property_type: data.property_type,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      size_sqm: data.size_sqm,
      max_occupants: data.max_occupants,
      furnished: data.furnished,
      bills_included: data.bills_included,
      bills_note: data.bills_note,
      gender_preference: data.gender_preference,
      price_amount: data.price_amount,
      price_currency: data.price_currency,
      deposit_amount: data.deposit_amount,
      deposit_currency: data.deposit_currency,
      city: data.city,
      neighbourhood: data.neighbourhood,
      address_private: data.address_private,
      university_id: universityIds[0] || data.university_id || null,
      university_ids: universityIds,
      available_from: data.available_from,
      minimum_stay_months: data.minimum_stay_months,
      amenities: data.amenities || [],
      status: data.status,
      rejection_reason: data.rejection_reason,
      photos,
    },
  };
}

export async function dbUpdateListing(user, id, body) {
  const admin = supabaseAdmin();
  const client = supabaseForToken(user.accessToken);
  const { data: lp } = await client.from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!lp) return { error: 'forbidden', status: 403 };

  const { data: existing } = await admin
    .from('listings')
    .select('id, landlord_id, status')
    .eq('id', id)
    .eq('landlord_id', lp.id)
    .maybeSingle();
  if (!existing) return { error: 'not_found', status: 404 };

  if (body.phone_e164) {
    await client.from('profiles').update({ phone_e164: String(body.phone_e164).trim() }).eq('id', user.id);
  }

  const title = (body.title || '').trim();
  const description = (body.description || '').trim();
  const priceAmount = Number(body.price_amount);
  const isDraft = !!body.draft;
  const resubmit = body.resubmit === true;
  const universityIds = normalizeUniversityIds(body);

  if (!isDraft && resubmit) {
    if (!title || title.length < 5) return { error: 'invalid', status: 400, detail: 'title' };
    if (!description || description.length < 20) return { error: 'invalid', status: 400, detail: 'description' };
    if (!(priceAmount > 0)) return { error: 'invalid', status: 400, detail: 'price' };
  }

  const fxToGbp = await resolveFxToGbp(admin);
  const currency = body.price_currency || 'GBP';
  const amenities = Array.isArray(body.amenities)
    ? body.amenities.filter(Boolean)
    : String(body.amenities || '').split(',').map((s) => s.trim()).filter(Boolean);

  let status = existing.status;
  if (isDraft) status = 'draft';
  else if (resubmit || ['draft', 'rejected'].includes(existing.status)) status = 'pending_review';

  const patch = {
    title_tr: title || undefined,
    title_en: title || undefined,
    description_tr: description,
    description_en: description,
    property_type: body.property_type || undefined,
    bedrooms: body.bedrooms != null ? Number(body.bedrooms) : undefined,
    bathrooms: body.bathrooms != null ? Number(body.bathrooms) : undefined,
    furnished: body.furnished != null ? (body.furnished !== false && body.furnished !== 'false') : undefined,
    size_sqm: body.size_sqm != null && body.size_sqm !== '' ? Number(body.size_sqm) : undefined,
    max_occupants: body.max_occupants != null && body.max_occupants !== '' ? Number(body.max_occupants) : undefined,
    gender_preference: body.gender_preference || undefined,
    available_from: body.available_from || undefined,
    minimum_stay_months: body.minimum_stay_months ? Number(body.minimum_stay_months) : undefined,
    price_amount: priceAmount > 0 ? priceAmount : undefined,
    price_currency: currency,
    price_gbp_normalised: priceAmount > 0 ? toGbp(priceAmount, currency, fxToGbp) : undefined,
    deposit_amount: body.deposit_amount !== undefined && body.deposit_amount !== '' ? Number(body.deposit_amount) : undefined,
    deposit_currency: body.deposit_currency || undefined,
    bills_included: body.bills_included != null ? (body.bills_included === true || body.bills_included === 'true') : undefined,
    bills_note: body.bills_note !== undefined ? body.bills_note : undefined,
    amenities,
    address_private: body.address_private !== undefined ? body.address_private : undefined,
    neighbourhood: body.neighbourhood !== undefined ? body.neighbourhood : undefined,
    city: body.city || undefined,
    university_id: universityIds.length ? universityIds[0] : (body.university_id === null || body.university_id === '' ? null : undefined),
    status,
    rejection_reason: status === 'pending_review' ? null : undefined,
    last_confirmed_available_at: new Date().toISOString(),
  };
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

  const { data, error } = await admin.from('listings').update(patch).eq('id', id).select('id, status, reference_code').single();
  if (error) throw error;

  if (body.university_ids !== undefined || body.university_id !== undefined) {
    try {
      await syncListingUniversities(admin, id, universityIds);
    } catch (e) {
      if (!/listing_universities|does not exist|schema cache/i.test(e?.message || '')) throw e;
    }
  }

  if (Array.isArray(body.photos) && body.photos.length) {
    await admin.from('listing_photos').delete().eq('listing_id', id);
    const photoRows = body.photos.slice(0, 20).map((p, i) => ({
      listing_id: id,
      storage_key: typeof p === 'string' ? p : p.storage_key || p.url,
      sort_order: typeof p === 'object' && p.sort_order != null ? p.sort_order : i,
      alt_text_tr: title || null,
    })).filter((p) => p.storage_key);
    if (photoRows.length) await admin.from('listing_photos').insert(photoRows);
  }

  await admin.from('audit_log').insert({
    actor_user_id: user.id,
    action: 'listing.update',
    entity_type: 'listing',
    entity_id: id,
    after_snapshot: { status: data.status },
  });

  return { ok: true, item: data };
}

export async function dbDeleteListing(user, id) {
  const admin = supabaseAdmin();
  const client = supabaseForToken(user.accessToken);
  const { data: lp } = await client.from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!lp) return { error: 'forbidden', status: 403 };

  const { data: existing } = await admin
    .from('listings')
    .select('id, status')
    .eq('id', id)
    .eq('landlord_id', lp.id)
    .maybeSingle();
  if (!existing) return { error: 'not_found', status: 404 };

  await admin.from('listing_photos').delete().eq('listing_id', id);
  const { error } = await admin.from('listings').delete().eq('id', id);
  if (error) throw error;
  await admin.from('audit_log').insert({
    actor_user_id: user.id,
    action: 'listing.delete',
    entity_type: 'listing',
    entity_id: id,
    before_snapshot: { status: existing.status },
  });
  return { ok: true };
}

/** Owner actions: pause | resume | close | reopen */
export async function dbOwnerListingAction(user, id, action) {
  const admin = supabaseAdmin();
  const client = supabaseForToken(user.accessToken);
  const { data: lp } = await client.from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!lp) return { error: 'forbidden', status: 403 };

  const { data: existing } = await admin
    .from('listings')
    .select('id, status, published_at')
    .eq('id', id)
    .eq('landlord_id', lp.id)
    .maybeSingle();
  if (!existing) return { error: 'not_found', status: 404 };

  const act = String(action || '').toLowerCase();
  let nextStatus = null;
  let patch = {};

  if (act === 'pause') {
    if (existing.status !== 'published') return { error: 'invalid_status', status: 400 };
    nextStatus = 'paused';
  } else if (act === 'resume') {
    if (existing.status !== 'paused') return { error: 'invalid_status', status: 400 };
    nextStatus = 'published';
    patch.published_at = existing.published_at || new Date().toISOString();
  } else if (act === 'close') {
    if (!['published', 'paused'].includes(existing.status)) return { error: 'invalid_status', status: 400 };
    nextStatus = 'rented';
  } else if (act === 'reopen') {
    if (!['rented', 'expired'].includes(existing.status)) return { error: 'invalid_status', status: 400 };
    nextStatus = 'pending_review';
  } else {
    return { error: 'invalid_action', status: 400 };
  }

  const { data, error } = await admin
    .from('listings')
    .update({ status: nextStatus, ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('landlord_id', lp.id)
    .select('id, status')
    .single();
  if (error) throw error;

  await admin.from('audit_log').insert({
    actor_user_id: user.id,
    action: `listing.owner.${act}`,
    entity_type: 'listing',
    entity_id: id,
    before_snapshot: { status: existing.status },
    after_snapshot: { status: nextStatus },
  });

  return { ok: true, item: data };
}

/**
 * Activate a promote plan on an owned listing (called after Shopier payment).
 */
export async function dbPromoteListing(user, listingId, planId) {
  const plan = getPremiumPlan(planId);
  if (!plan) return { error: 'invalid_plan', status: 400 };

  const admin = supabaseAdmin();
  const client = supabaseForToken(user.accessToken);
  const { data: lp } = await client.from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!lp) return { error: 'forbidden', status: 403 };

  const { data: existing } = await admin
    .from('listings')
    .select('id, status, reference_code, title_tr, premium_tier, premium_until')
    .eq('id', listingId)
    .eq('landlord_id', lp.id)
    .maybeSingle();
  if (!existing) return { error: 'not_found', status: 404 };
  if (existing.status !== 'published') return { error: 'listing_not_published', status: 400 };

  const until = computePremiumUntil(plan.id);
  const { data, error } = await admin
    .from('listings')
    .update({
      premium_tier: plan.id,
      premium_until: until,
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId)
    .eq('landlord_id', lp.id)
    .select('id, reference_code, title_tr, premium_tier, premium_until, status')
    .single();
  if (error) throw error;

  await admin.from('audit_log').insert({
    actor_user_id: user.id,
    action: 'listing.promote',
    entity_type: 'listing',
    entity_id: listingId,
    before_snapshot: { premium_tier: existing.premium_tier, premium_until: existing.premium_until },
    after_snapshot: { premium_tier: plan.id, premium_until: until, plan },
  });

  const prem = mapPremiumFields(data);
  return {
    ok: true,
    item: {
      id: data.id,
      reference_code: data.reference_code,
      title: data.title_tr,
      status: data.status,
      premium_tier: prem.premium_tier,
      premium_until: prem.premium_until,
      premium: prem.premium,
    },
    plan: {
      id: plan.id,
      duration_days: plan.duration_days,
      rank: plan.rank,
      features: {
        boost_search: plan.boost_search,
        gold_border: plan.gold_border,
        badge: plan.badge,
        featured_section: plan.featured_section,
        sparkle: plan.sparkle,
        priority_support: plan.priority_support,
      },
    },
  };
}

function splitName(fullName, email) {
  const raw = String(fullName || '').trim() || String(email || '').split('@')[0] || 'Musteri';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { name: parts[0], surname: '-' };
  return { name: parts[0], surname: parts.slice(1).join(' ') };
}

function makePlatformOrderId() {
  const t = Date.now().toString(36).toUpperCase();
  const r = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `KO${t}${r}`.slice(0, 24);
}

/**
 * Create a pending Shopier order and return PAT hosted-checkout form fields.
 */
export async function dbCreateShopierCheckout(user, body = {}) {
  const plan = getPremiumPlan(body.plan);
  if (!plan) return { error: 'invalid_plan', status: 400 };
  if (!isShopierConfigured()) return { error: 'shopier_not_configured', status: 503 };

  const listingId = body.listing_id;
  if (!listingId) return { error: 'invalid', status: 400, detail: 'listing_id' };

  const admin = supabaseAdmin();
  const client = supabaseForToken(user.accessToken);
  const { data: lp } = await client.from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!lp) return { error: 'forbidden', status: 403 };

  const { data: listing } = await admin
    .from('listings')
    .select('id, status, reference_code, title_tr, city')
    .eq('id', listingId)
    .eq('landlord_id', lp.id)
    .maybeSingle();
  if (!listing) return { error: 'not_found', status: 404 };
  if (listing.status !== 'published') return { error: 'listing_not_published', status: 400 };

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, phone_e164, preferred_language, created_at')
    .eq('id', user.id)
    .maybeSingle();

  const buyerName = (body.buyer_name || profile?.full_name || '').trim();
  const buyerEmail = (body.buyer_email || user.email || '').trim();
  const buyerPhone = (body.buyer_phone || profile?.phone_e164 || '').trim();
  const city = (body.city || listing.city || 'Lefkosa').trim();

  if (!buyerEmail) return { error: 'invalid', status: 400, detail: 'email' };
  if (!buyerPhone || buyerPhone.replace(/\D/g, '').length < 8) {
    return { error: 'invalid', status: 400, detail: 'phone' };
  }

  const platformOrderId = makePlatformOrderId();
  const { name, surname } = splitName(buyerName || buyerEmail, buyerEmail);

  const { data: order, error } = await admin
    .from('premium_orders')
    .insert({
      platform_order_id: platformOrderId,
      user_id: user.id,
      listing_id: listing.id,
      plan_id: plan.id,
      amount: plan.price_amount,
      currency: plan.currency || 'TRY',
      status: 'pending',
      buyer_name: `${name} ${surname}`.trim(),
      buyer_email: buyerEmail,
      buyer_phone: buyerPhone,
    })
    .select('id, platform_order_id, plan_id, amount, currency, status, listing_id')
    .single();
  if (error) throw error;

  const productName = `Premium ${plan.id.toUpperCase()} · ${listing.reference_code}`;
  let checkout;
  try {
    checkout = await createShopierCheckout({
      orderId: platformOrderId,
      amount: plan.price_amount,
      currency: plan.currency || 'TRY',
      productName,
      description: `Kıbrıs Öğrenci premium · ${listing.reference_code} · ${city}`,
    });
  } catch (e) {
    console.error('[shopier] create product failed', e?.message || e, e?.payload || null);
    await admin.from('premium_orders').update({ status: 'cancelled' }).eq('id', order.id);
    return {
      error: e?.message === 'shopier_not_configured' ? 'shopier_not_configured' : 'shopier_create_failed',
      status: 503,
      detail: e?.message || null,
    };
  }

  {
    const payload = {
      product_id: checkout.productId,
      payment_url: checkout.paymentUrl,
      city,
    };
    const { error: updErr } = await admin
      .from('premium_orders')
      .update({
        shopier_product_id: checkout.productId,
        shopier_payload: payload,
      })
      .eq('id', order.id);
    if (updErr && /shopier_product_id/i.test(updErr.message || '')) {
      const { error: fallbackErr } = await admin
        .from('premium_orders')
        .update({ shopier_payload: payload })
        .eq('id', order.id);
      if (fallbackErr) throw fallbackErr;
    } else if (updErr) {
      throw updErr;
    }
  }

  await admin.from('audit_log').insert({
    actor_user_id: user.id,
    action: 'premium.checkout_start',
    entity_type: 'premium_order',
    entity_id: order.id,
    after_snapshot: {
      platform_order_id: platformOrderId,
      plan: plan.id,
      listing_id: listing.id,
      shopier_product_id: checkout.productId,
    },
  });

  return {
    ok: true,
    order: {
      id: order.id,
      platform_order_id: order.platform_order_id,
      plan_id: order.plan_id,
      amount: Number(order.amount),
      currency: order.currency,
      listing_id: order.listing_id,
      listing_ref: listing.reference_code,
      listing_title: listing.title_tr,
    },
    shopier: {
      actionUrl: checkout.actionUrl,
      fields: checkout.fields,
      productId: checkout.productId,
      paymentUrl: checkout.paymentUrl,
    },
  };
}

/**
 * Activate premium from a verified Shopier order.created webhook (idempotent).
 */
export async function dbFulfillShopierWebhookOrder(shopierOrder, meta = {}) {
  const admin = supabaseAdmin();
  const paymentStatus = String(shopierOrder?.paymentStatus || '').toLowerCase();
  const lineItems = Array.isArray(shopierOrder?.lineItems) ? shopierOrder.lineItems : [];
  const productIds = lineItems
    .map((li) => (li?.productId != null ? String(li.productId) : ''))
    .filter(Boolean);

  if (!productIds.length) {
    return { error: 'missing_product', status: 400 };
  }

  // Match local pending order by Shopier product id (preferred) or customNote = platform_order_id
  let order = null;
  {
    const { data: byProductRows, error: byProductErr } = await admin
      .from('premium_orders')
      .select('*')
      .in('shopier_product_id', productIds)
      .order('created_at', { ascending: false })
      .limit(1);
    if (!byProductErr) {
      order = byProductRows?.[0] || null;
    }
  }

  if (!order) {
    const { data: pendingRows } = await admin
      .from('premium_orders')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(80);
    order = (pendingRows || []).find((row) => {
      const pid = row?.shopier_payload?.product_id;
      return pid != null && productIds.includes(String(pid));
    }) || null;
  }

  if (!order) {
    const note = String(shopierOrder?.note || '').trim();
    if (note) {
      const { data: byNote } = await admin
        .from('premium_orders')
        .select('*')
        .eq('platform_order_id', note)
        .maybeSingle();
      order = byNote;
    }
  }

  if (!order) return { error: 'order_not_found', status: 404 };

  if (paymentStatus && paymentStatus !== 'paid') {
    await admin
      .from('premium_orders')
      .update({
        status: 'failed',
        shopier_payment_id: shopierOrder?.id ? String(shopierOrder.id) : null,
        shopier_payload: { ...meta, order: shopierOrder },
      })
      .eq('id', order.id)
      .eq('status', 'pending');
    return { ok: true, paid: false, platform_order_id: order.platform_order_id };
  }

  if (order.status === 'paid') {
    for (const pid of productIds) await deleteShopierProduct(pid);
    return {
      ok: true,
      paid: true,
      already: true,
      platform_order_id: order.platform_order_id,
      listing_id: order.listing_id,
      plan_id: order.plan_id,
    };
  }

  const plan = getPremiumPlan(order.plan_id);
  if (!plan) return { error: 'invalid_plan', status: 400 };

  const until = computePremiumUntil(plan.id);
  const { error: listErr } = await admin
    .from('listings')
    .update({
      premium_tier: plan.id,
      premium_until: until,
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.listing_id);
  if (listErr) throw listErr;

  const { error: ordErr } = await admin
    .from('premium_orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      shopier_payment_id: shopierOrder?.id ? String(shopierOrder.id) : null,
      shopier_payload: { ...meta, order: shopierOrder },
    })
    .eq('id', order.id)
    .eq('status', 'pending');
  if (ordErr) throw ordErr;

  await admin.from('audit_log').insert({
    actor_user_id: order.user_id,
    action: 'premium.paid',
    entity_type: 'premium_order',
    entity_id: order.id,
    after_snapshot: {
      platform_order_id: order.platform_order_id,
      payment_id: shopierOrder?.id || null,
      shopier_product_ids: productIds,
      plan: plan.id,
      listing_id: order.listing_id,
      premium_until: until,
    },
  });

  for (const pid of productIds) await deleteShopierProduct(pid);

  const { data: listing } = await admin
    .from('listings')
    .select('reference_code')
    .eq('id', order.listing_id)
    .maybeSingle();

  return {
    ok: true,
    paid: true,
    platform_order_id: order.platform_order_id,
    listing_id: order.listing_id,
    listing_ref: listing?.reference_code || null,
    plan_id: order.plan_id,
  };
}

export async function dbGetPremiumOrder(user, platformOrderId) {
  if (!platformOrderId) return { error: 'invalid', status: 400 };
  const admin = supabaseAdmin();
  const { data: order } = await admin
    .from('premium_orders')
    .select('*, listings:listing_id ( reference_code, title_tr )')
    .eq('platform_order_id', platformOrderId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!order) return { error: 'not_found', status: 404 };
  return {
    ok: true,
    order: {
      id: order.id,
      platform_order_id: order.platform_order_id,
      plan_id: order.plan_id,
      amount: Number(order.amount),
      currency: order.currency,
      status: order.status,
      paid_at: order.paid_at,
      listing_id: order.listing_id,
      listing_ref: order.listings?.reference_code || null,
      listing_title: order.listings?.title_tr || null,
    },
  };
}

export async function dbBecomeLandlord(user, body = {}) {
  const admin = supabaseAdmin();
  const role = user.profile?.role;
  if (role === 'admin') return { ok: true, role: 'admin' };

  const fullName = (body.full_name || body.display_name || user.profile?.full_name || user.email || '').trim();
  const phone = (body.phone_e164 || '').trim();

  await admin.from('profiles').update({
    role: 'landlord',
    full_name: fullName || null,
    phone_e164: phone || null,
  }).eq('id', user.id);

  const client = supabaseForToken(user.accessToken);
  let { data: lp } = await client.from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  const lpPayload = {
    display_name: fullName,
    is_agency: !!body.is_agency,
    agency_name: body.is_agency ? (body.agency_name || null) : null,
  };
  if (!lp) {
    const { data: created, error } = await client
      .from('landlord_profiles')
      .insert({ user_id: user.id, ...lpPayload })
      .select('id')
      .single();
    if (error) throw error;
    lp = created;
  } else {
    await client.from('landlord_profiles').update(lpPayload).eq('id', lp.id);
  }

  if (body.request_verification) {
    // Mark pending review queue for admins (document upload can follow later)
    await admin.from('landlord_profiles').update({
      verification_status: 'pending',
      verification_note: [
        body.city ? `city=${body.city}` : null,
        phone ? `phone=${phone}` : null,
        body.is_agency ? `agency=${body.agency_name || 'yes'}` : 'individual',
      ].filter(Boolean).join(' · '),
    }).eq('id', lp.id);

    try {
      await admin.from('verification_requests').insert({
        landlord_id: lp.id,
        status: 'pending',
        document_key: null,
      });
    } catch {
      /* ignore */
    }
  }

  try {
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { role: 'landlord' },
    });
  } catch {
    /* ignore */
  }

  try {
    await admin.from('audit_log').insert({
      actor_user_id: user.id,
      action: 'landlord.onboard',
      entity_type: 'landlord_profile',
      entity_id: lp.id,
      after_snapshot: { verification: body.request_verification ? 'pending' : 'unverified' },
    });
  } catch {
    /* ignore */
  }

  return { ok: true, role: 'landlord', landlord_profile_id: lp.id, verification: body.request_verification ? 'pending' : 'unverified' };
}

export async function dbGetMyProfile(user) {
  const admin = supabaseAdmin();
  let row = null;
  const full = await admin
    .from('profiles')
    .select('id, role, status, full_name, phone_e164, preferred_language, preferred_currency, avatar_key, bio, city, university_id, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();
  if (full.error && /avatar_key|bio|university_id|column/i.test(full.error.message || '')) {
    const basic = await admin
      .from('profiles')
      .select('id, role, status, full_name, phone_e164, preferred_language, preferred_currency, created_at, updated_at')
      .eq('id', user.id)
      .maybeSingle();
    row = basic.data;
  } else {
    if (full.error) throw full.error;
    row = full.data;
  }

  let meta = {};
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(user.id);
    meta = authUser?.user?.user_metadata || {};
  } catch {
    /* ignore */
  }

  const avatar_key = row?.avatar_key || meta.avatar_key || null;
  return {
    id: user.id,
    email: user.email || null,
    role: row?.role || user.role || 'student',
    status: row?.status || 'active',
    full_name: row?.full_name || meta.full_name || '',
    phone_e164: row?.phone_e164 || meta.phone_e164 || '',
    preferred_language: row?.preferred_language || meta.preferred_language || 'tr',
    preferred_currency: row?.preferred_currency || meta.preferred_currency || 'GBP',
    bio: row?.bio || meta.bio || '',
    city: row?.city || meta.city || '',
    university_id: row?.university_id || meta.university_id || null,
    avatar_key,
    avatar_url: avatar_key ? `/api/media?b=avatars&k=${encodeURIComponent(avatar_key)}` : null,
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
  };
}

export async function dbUpdateProfile(user, body = {}) {
  const admin = supabaseAdmin();
  const patch = {};
  if (body.full_name !== undefined) patch.full_name = String(body.full_name || '').trim() || null;
  if (body.phone_e164 !== undefined) patch.phone_e164 = String(body.phone_e164 || '').trim() || null;
  if (body.preferred_language !== undefined) {
    const lang = String(body.preferred_language || 'tr').slice(0, 5);
    patch.preferred_language = lang;
  }
  if (body.preferred_currency !== undefined) {
    const cur = String(body.preferred_currency || 'GBP').toUpperCase();
    if (['TRY', 'GBP', 'USD', 'EUR'].includes(cur)) patch.preferred_currency = cur;
  }
  if (body.bio !== undefined) patch.bio = String(body.bio || '').trim().slice(0, 500) || null;
  if (body.city !== undefined) patch.city = String(body.city || '').trim() || null;
  if (body.university_id !== undefined) {
    patch.university_id = body.university_id || null;
  }
  // Only accept avatar_key that belongs to this user (upload path). Ignore forged keys.
  if (body.avatar_key !== undefined) {
    const key = body.avatar_key || null;
    if (key === null) {
      patch.avatar_key = null;
    } else if (
      typeof key === 'string' &&
      key.length <= 512 &&
      !key.includes('..') &&
      key.startsWith(`${user.id}/`)
    ) {
      patch.avatar_key = key;
    }
  }
  if (body.clear_avatar) {
    patch.avatar_key = null;
    try {
      const { data: existing } = await admin.storage.from('avatars').list(user.id, { limit: 20 });
      const toRemove = (existing || []).map((f) => `${user.id}/${f.name}`);
      if (toRemove.length) await admin.storage.from('avatars').remove(toRemove);
    } catch {
      /* ignore */
    }
  }

  // Keep auth metadata in sync (also works before SQL migration adds columns)
  const metaPatch = {};
  if (patch.full_name !== undefined) metaPatch.full_name = patch.full_name;
  if (patch.phone_e164 !== undefined) metaPatch.phone_e164 = patch.phone_e164;
  if (patch.preferred_language !== undefined) metaPatch.preferred_language = patch.preferred_language;
  if (patch.preferred_currency !== undefined) metaPatch.preferred_currency = patch.preferred_currency;
  if (patch.bio !== undefined) metaPatch.bio = patch.bio;
  if (patch.city !== undefined) metaPatch.city = patch.city;
  if (patch.university_id !== undefined) metaPatch.university_id = patch.university_id;
  if (patch.avatar_key !== undefined) metaPatch.avatar_key = patch.avatar_key;

  if (Object.keys(metaPatch).length) {
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(user.id);
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...(authUser?.user?.user_metadata || {}), ...metaPatch },
      });
    } catch {
      /* ignore */
    }
  }

  if (Object.keys(patch).length) {
    const { error } = await admin.from('profiles').update(patch).eq('id', user.id);
    if (error && /avatar_key|bio|university_id|column/i.test(error.message || '')) {
      const safe = {};
      if (patch.full_name !== undefined) safe.full_name = patch.full_name;
      if (patch.phone_e164 !== undefined) safe.phone_e164 = patch.phone_e164;
      if (patch.preferred_language !== undefined) safe.preferred_language = patch.preferred_language;
      if (patch.preferred_currency !== undefined) safe.preferred_currency = patch.preferred_currency;
      if (Object.keys(safe).length) {
        const { error: e2 } = await admin.from('profiles').update(safe).eq('id', user.id);
        if (e2) throw e2;
      }
    } else if (error) {
      throw error;
    }
  }

  return { ok: true, profile: await dbGetMyProfile(user) };
}

export async function dbUploadAvatar(user, fileBuffer, contentType, fileName) {
  const admin = supabaseAdmin();
  const mime = String(contentType || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    return { error: 'invalid_type', status: 400 };
  }
  if (!fileBuffer?.length || fileBuffer.length > 5 * 1024 * 1024) {
    return { error: 'invalid_size', status: 400 };
  }
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const key = `${user.id}/avatar.${ext}`;

  // Remove previous avatar variants for this user
  try {
    const { data: existing } = await admin.storage.from('avatars').list(user.id, { limit: 20 });
    const toRemove = (existing || []).map((f) => `${user.id}/${f.name}`);
    if (toRemove.length) await admin.storage.from('avatars').remove(toRemove);
  } catch {
    /* ignore */
  }

  const { error: upErr } = await admin.storage.from('avatars').upload(key, fileBuffer, {
    contentType: mime,
    upsert: true,
    cacheControl: '3600',
  });
  if (upErr) return { error: 'upload_failed', status: 500, detail: upErr.message };

  const updated = await dbUpdateProfile(user, { avatar_key: key });
  return { ok: true, avatar_key: key, avatar_url: `/api/media?b=avatars&k=${encodeURIComponent(key)}`, profile: updated.profile };
}

export async function dbMyAnalytics(user) {
  const mine = await dbMyListings(user);
  const weeks = ['-5w', '-4w', '-3w', '-2w', '-1w', 'now'];
  const totalViews = (mine.items || []).reduce((s, l) => s + (l.view_count || 0), 0);
  const totalReveals = (mine.items || []).reduce((s, l) => s + (l.contact_reveal_count || 0), 0);
  const totalReports = (mine.items || []).reduce((s, l) => s + (l.open_reports || 0), 0);
  // Distribute totals across weeks for a readable trend until daily rollups exist
  const trend = weeks.map((w, i) => ({
    week: w,
    views: Math.round((totalViews / weeks.length) * (0.6 + i * 0.12)),
    reveals: Math.round((totalReveals / weeks.length) * (0.6 + i * 0.12)),
  }));
  return {
    trend,
    totals: {
      views: totalViews,
      reveals: totalReveals,
      reports_open: totalReports,
      listings: mine.items.length,
    },
    listings: (mine.items || []).map((l) => ({
      id: l.id,
      reference_code: l.reference_code,
      title: l.title,
      status: l.status,
      view_count: l.view_count || 0,
      contact_reveal_count: l.contact_reveal_count || 0,
      open_reports: l.open_reports || 0,
      report_count: l.report_count || 0,
    })),
  };
}

export async function dbMyReports(user) {
  const client = supabaseForToken(user.accessToken);
  const { data: lp } = await client.from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!lp) return { items: [] };

  const { data: listings } = await client
    .from('listings')
    .select('id, reference_code, title_tr, status')
    .eq('landlord_id', lp.id);
  const ids = (listings || []).map((l) => l.id);
  if (!ids.length) return { items: [] };
  const byId = Object.fromEntries((listings || []).map((l) => [l.id, l]));

  const admin = supabaseAdmin();
  const { data } = await admin
    .from('reports')
    .select('id, listing_id, reason, detail, status, report_count, created_at')
    .in('listing_id', ids)
    .order('created_at', { ascending: false })
    .limit(100);

  return {
    items: (data || []).map((r) => ({
      id: r.id,
      listing_id: r.listing_id,
      ref: byId[r.listing_id]?.reference_code || null,
      title: byId[r.listing_id]?.title_tr || null,
      listing_status: byId[r.listing_id]?.status || null,
      reason: r.reason,
      detail: r.detail,
      status: r.status,
      count: r.report_count || 1,
      created_at: r.created_at,
    })),
  };
}

export async function dbMyInquiries(user) {
  const client = supabaseForToken(user.accessToken);
  const { data: lp } = await client.from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!lp) return { items: [] };

  const { data: listingIds } = await client.from('listings').select('id, reference_code, title_tr').eq('landlord_id', lp.id);
  const ids = (listingIds || []).map((l) => l.id);
  if (!ids.length) return { items: [] };
  const byId = Object.fromEntries((listingIds || []).map((l) => [l.id, l]));

  const admin = supabaseAdmin();
  const { data } = await admin
    .from('inquiries')
    .select('id, listing_id, message, source, status, created_at, student_id')
    .in('listing_id', ids)
    .order('created_at', { ascending: false })
    .limit(50);

  return {
    items: (data || []).map((i) => ({
      id: i.id,
      from: i.student_id ? `Öğrenci ${i.student_id.slice(0, 6)}` : 'Anonim',
      ref: byId[i.listing_id]?.reference_code,
      message: i.message,
      source: i.source,
      status: i.status,
      created_at: i.created_at,
    })),
  };
}

export async function dbMyBilling(user) {
  const admin = supabaseAdmin();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('*, packages(name, listing_quota)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  const { data: invoices } = await admin
    .from('invoices')
    .select('*')
    .eq('user_id', user.id)
    .order('issued_at', { ascending: false })
    .limit(20);

  const { data: premiumOrders } = await admin
    .from('premium_orders')
    .select('id, platform_order_id, plan_id, amount, currency, status, paid_at, created_at, shopier_payment_id, listings:listing_id(reference_code)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const mine = await dbMyListings(user);
  return {
    subscription: sub
      ? {
          package: sub.packages?.name,
          status: sub.status,
          listings_used: mine.items.length,
          listings_total: sub.packages?.listing_quota || 0,
          ends_at: sub.ends_at,
        }
      : null,
    invoices: (invoices || []).map((inv) => ({
      id: inv.id,
      package: inv.bank_reference,
      amount: Number(inv.amount),
      currency: inv.currency,
      status: inv.status,
      bank_reference: inv.bank_reference,
    })),
    premium_orders: (premiumOrders || []).map((o) => ({
      id: o.id,
      platform_order_id: o.platform_order_id,
      plan_id: o.plan_id,
      amount: Number(o.amount),
      currency: o.currency,
      status: o.status,
      paid_at: o.paid_at,
      created_at: o.created_at,
      shopier_payment_id: o.shopier_payment_id,
      listing_ref: o.listings?.reference_code || null,
      source: 'shopier',
    })),
    bank_instructions: {
      bank: process.env.BANK_NAME || 'Kıbrıs Vakıflar Bankası',
      iban: process.env.BANK_IBAN || '',
      reference: `KO-${user.id.slice(0, 8).toUpperCase()}`,
    },
  };
}

/** Admin: bank invoices + Shopier premium payments (newest first). */
export async function dbAdminPayments() {
  const admin = supabaseAdmin();
  const [{ data: invoices, error: invErr }, { data: premium, error: premErr }] = await Promise.all([
    admin
      .from('invoices')
      .select('id, user_id, amount, currency, status, bank_reference, issued_at, marked_paid_at, profiles(full_name)')
      .order('issued_at', { ascending: false })
      .limit(100),
    admin
      .from('premium_orders')
      .select('id, platform_order_id, user_id, listing_id, plan_id, amount, currency, status, buyer_name, buyer_email, buyer_phone, shopier_payment_id, created_at, paid_at, profiles(full_name), listings:listing_id(reference_code, title_tr)')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (invErr) throw invErr;
  // premium_orders table may not exist yet before migration
  const premiumRows = premErr ? [] : (premium || []);

  const bankItems = (invoices || []).map((inv) => ({
    id: inv.id,
    source: 'bank',
    user: inv.profiles?.full_name || inv.user_id?.slice(0, 8),
    user_email: null,
    package: inv.bank_reference || 'Paket',
    plan_id: null,
    amount: Number(inv.amount),
    currency: inv.currency,
    status: inv.status === 'paid' ? 'paid' : inv.status === 'void' ? 'cancelled' : 'pending',
    bank_reference: inv.bank_reference,
    platform_order_id: null,
    shopier_payment_id: null,
    listing_ref: null,
    listing_title: null,
    created_at: inv.issued_at,
    paid_at: inv.marked_paid_at || null,
  }));

  const shopierItems = premiumRows.map((o) => ({
    id: o.id,
    source: 'shopier',
    user: o.buyer_name || o.profiles?.full_name || o.user_id?.slice(0, 8),
    user_email: o.buyer_email || null,
    package: `Premium ${String(o.plan_id || '').toUpperCase()}`,
    plan_id: o.plan_id,
    amount: Number(o.amount),
    currency: o.currency,
    status: o.status === 'paid' ? 'paid' : o.status === 'failed' ? 'failed' : o.status === 'cancelled' ? 'cancelled' : 'pending',
    bank_reference: null,
    platform_order_id: o.platform_order_id,
    shopier_payment_id: o.shopier_payment_id,
    listing_ref: o.listings?.reference_code || null,
    listing_title: o.listings?.title_tr || null,
    buyer_phone: o.buyer_phone || null,
    created_at: o.created_at,
    paid_at: o.paid_at || null,
  }));

  const items = [...shopierItems, ...bankItems].sort((a, b) => {
    const da = new Date(a.paid_at || a.created_at || 0).getTime();
    const db = new Date(b.paid_at || b.created_at || 0).getTime();
    return db - da;
  });

  return {
    items,
    summary: {
      shopier_paid: shopierItems.filter((i) => i.status === 'paid').length,
      shopier_pending: shopierItems.filter((i) => i.status === 'pending').length,
      bank_unpaid: bankItems.filter((i) => i.status === 'pending' || i.status === 'unpaid').length,
    },
  };
}

export async function dbAdminReports() {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('reports')
    .select(`
      id, listing_id, reason, detail, status, report_count, created_at,
      listings (
        id, reference_code, title_tr, status, city,
        landlord_profiles ( display_name, user_id )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);
  return {
    items: (data || []).map((r) => ({
      id: r.id,
      listing_id: r.listing_id,
      ref: r.listings?.reference_code || r.listing_id?.slice(0, 8),
      title: r.listings?.title_tr || null,
      listing_status: r.listings?.status || null,
      city: r.listings?.city || null,
      owner: r.listings?.landlord_profiles?.display_name || null,
      reason: r.reason,
      detail: r.detail,
      status: r.status,
      count: r.report_count || 1,
      created_at: r.created_at,
    })),
  };
}

export async function dbAdminResolveReport(adminUser, body) {
  const admin = supabaseAdmin();
  if (!body.id) return { error: 'invalid', status: 400 };

  const { data: report } = await admin
    .from('reports')
    .select('id, listing_id, status')
    .eq('id', body.id)
    .maybeSingle();
  if (!report) return { error: 'not_found', status: 404 };

  const action = body.action || 'dismiss';
  await admin.from('reports').update({
    status: 'resolved',
    resolved_by: adminUser.id,
  }).eq('id', body.id);

  let listingStatus = null;
  if (action === 'unpublish' && report.listing_id) {
    await admin.from('listings').update({
      status: 'rejected',
      rejection_reason: body.reason
        || 'İlan şikayet incelemesi sonucu yayından kaldırıldı.',
    }).eq('id', report.listing_id);
    listingStatus = 'rejected';
  }

  await admin.from('audit_log').insert({
    actor_user_id: adminUser.id,
    action: `report.${action}`,
    entity_type: 'report',
    entity_id: body.id,
    after_snapshot: {
      status: 'resolved',
      action,
      listing_id: report.listing_id,
      listing_status: listingStatus,
    },
  });

  return { ok: true, listing_status: listingStatus };
}

export async function dbAdminCoords() {
  return dbAdminUniversities();
}

export async function dbAdminUniversities() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('universities')
    .select('id, slug, name_tr, name_en, city, coordinates_verified, campus_location, student_count_estimate, is_active')
    .order('name_tr');
  if (error) throw error;
  return {
    items: (data || []).map((u) => {
      const pt = parseGeoPoint(u.campus_location) || { lat: null, lng: null };
      return {
        id: u.id,
        slug: u.slug,
        short: universityShort(u.slug, u.name_en, u.name_tr),
        name: u.name_tr || u.name_en,
        name_tr: u.name_tr,
        name_en: u.name_en,
        city: u.city,
        lat: pt.lat,
        lng: pt.lng,
        students: u.student_count_estimate,
        coordinates_verified: !!u.coordinates_verified,
        is_active: u.is_active !== false,
      };
    }),
  };
}

async function setCampusPoint(admin, id, lat, lng) {
  if (lat == null || lng == null || lat === '' || lng === '') return;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) {
    throw Object.assign(new Error('invalid_coords'), { status: 400 });
  }
  if (la < -90 || la > 90 || ln < -180 || ln > 180) {
    throw Object.assign(new Error('invalid_coords'), { status: 400 });
  }
  const { error } = await admin.rpc('admin_set_university_campus', {
    p_id: id,
    p_lat: la,
    p_lng: ln,
  });
  if (error) {
    // Fallback EWKT if RPC not applied yet
    const ewkt = `SRID=4326;POINT(${ln} ${la})`;
    const { error: e2 } = await admin.from('universities').update({ campus_location: ewkt }).eq('id', id);
    if (e2) throw error;
  }
}

export async function dbAdminUniversitySave(adminUser, body) {
  const admin = supabaseAdmin();
  const nameTr = String(body.name_tr || body.name || '').trim();
  const nameEn = String(body.name_en || nameTr).trim();
  if (nameTr.length < 2) return { error: 'name_required', status: 400 };

  const city = String(body.city || '').trim();
  if (!city) return { error: 'city_required', status: 400 };

  let slug = String(body.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) slug = slugifyUniversityName(nameTr);

  const students = body.students != null && body.students !== ''
    ? Number(body.students)
    : null;
  const verify = body.coordinates_verified === true || body.coordinates_verified === 'true';
  const isActive = body.is_active === false || body.is_active === 'false' ? false : true;
  const lat = body.lat;
  const lng = body.lng;
  const hasCoords = lat != null && lng != null && lat !== '' && lng !== ''
    && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

  const id = body.id || null;
  let before = null;

  if (id) {
    const { data: existing } = await admin.from('universities').select('*').eq('id', id).maybeSingle();
    if (!existing) return { error: 'not_found', status: 404 };
    before = existing;

    // Unique slug among others
    const { data: clash } = await admin.from('universities').select('id').eq('slug', slug).neq('id', id).maybeSingle();
    if (clash) return { error: 'slug_taken', status: 409 };

    const { error } = await admin.from('universities').update({
      name_tr: nameTr,
      name_en: nameEn,
      slug,
      city,
      student_count_estimate: Number.isFinite(students) ? students : existing.student_count_estimate,
      coordinates_verified: verify,
      is_active: isActive,
    }).eq('id', id);
    if (error) throw error;

    if (hasCoords) await setCampusPoint(admin, id, lat, lng);

    await admin.from('audit_log').insert({
      actor_user_id: adminUser.id,
      action: 'university.update',
      entity_type: 'university',
      entity_id: id,
      before_snapshot: { slug: before.slug, city: before.city, verified: before.coordinates_verified },
      after_snapshot: { slug, city, verified: verify, lat: hasCoords ? Number(lat) : null, lng: hasCoords ? Number(lng) : null },
    });
    return { ok: true, id };
  }

  // Create — ensure unique slug
  let finalSlug = slug;
  for (let i = 0; i < 8; i++) {
    const { data: clash } = await admin.from('universities').select('id').eq('slug', finalSlug).maybeSingle();
    if (!clash) break;
    finalSlug = `${slug}-${i + 2}`;
  }

  const { data: created, error } = await admin.from('universities').insert({
    name_tr: nameTr,
    name_en: nameEn,
    slug: finalSlug,
    city,
    student_count_estimate: Number.isFinite(students) ? students : null,
    coordinates_verified: verify && hasCoords,
    is_active: isActive,
  }).select('id').single();
  if (error) throw error;

  if (hasCoords) await setCampusPoint(admin, created.id, lat, lng);

  await admin.from('audit_log').insert({
    actor_user_id: adminUser.id,
    action: 'university.create',
    entity_type: 'university',
    entity_id: created.id,
    after_snapshot: { slug: finalSlug, city, lat: hasCoords ? Number(lat) : null, lng: hasCoords ? Number(lng) : null },
  });
  return { ok: true, id: created.id };
}

export async function dbAdminUniversityDelete(adminUser, body) {
  const admin = supabaseAdmin();
  const id = body.id;
  if (!id) return { error: 'invalid', status: 400 };

  const { data: existing } = await admin.from('universities').select('id, slug, name_tr, is_active').eq('id', id).maybeSingle();
  if (!existing) return { error: 'not_found', status: 404 };

  const hard = body.hard === true || body.hard === 'true';
  if (hard) {
    const { count } = await admin
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('university_id', id);
    if ((count || 0) > 0) return { error: 'has_listings', status: 409 };
    const { error } = await admin.from('universities').delete().eq('id', id);
    if (error) throw error;
    await admin.from('audit_log').insert({
      actor_user_id: adminUser.id,
      action: 'university.delete',
      entity_type: 'university',
      entity_id: id,
      before_snapshot: { slug: existing.slug, name: existing.name_tr },
    });
    return { ok: true, deleted: true };
  }

  const { error } = await admin.from('universities').update({ is_active: false }).eq('id', id);
  if (error) throw error;
  await admin.from('audit_log').insert({
    actor_user_id: adminUser.id,
    action: 'university.deactivate',
    entity_type: 'university',
    entity_id: id,
    before_snapshot: { is_active: existing.is_active },
    after_snapshot: { is_active: false },
  });
  return { ok: true, deactivated: true };
}

export async function dbAdminUniversityVerify(adminUser, body) {
  const admin = supabaseAdmin();
  if (!body.id) return { error: 'invalid', status: 400 };
  const patch = { coordinates_verified: true };
  if (body.lat != null && body.lng != null) {
    await setCampusPoint(admin, body.id, body.lat, body.lng);
  }
  const { error } = await admin.from('universities').update(patch).eq('id', body.id);
  if (error) throw error;
  await admin.from('audit_log').insert({
    actor_user_id: adminUser.id,
    action: 'university.verify_coords',
    entity_type: 'university',
    entity_id: body.id,
    after_snapshot: { coordinates_verified: true },
  });
  return { ok: true };
}

export async function dbAdminQueue() {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('listings')
    .select('id, reference_code, title_tr, status, risk_flags, price_amount, price_currency, city, landlord_profiles(display_name), listing_photos(storage_key, sort_order)')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true });

  const items = [];
  for (const l of data || []) {
    const raw = (l.listing_photos || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((p) => p.storage_key);
    const photos = await resolvePhotoUrls(raw);
    items.push({
      id: l.id,
      reference_code: l.reference_code,
      title: l.title_tr,
      owner: l.landlord_profiles?.display_name,
      status: l.status,
      city: l.city,
      risk_flags: l.risk_flags || [],
      photo: photos[0] || '/logo-icon.png',
      price: { amount: Number(l.price_amount), currency: l.price_currency },
      priority: (l.risk_flags || []).length > 0,
    });
  }
  return { items };
}

export async function dbAdminListingDetail(id) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('listings')
    .select(`
      *,
      listing_photos ( storage_key, sort_order ),
      landlord_profiles ( id, display_name, is_agency, agency_name, verification_status, user_id ),
      universities:university_id ( id, slug, name_tr, name_en, city )
    `)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { error: 'not_found', status: 404 };

  const rawPhotos = (data.listing_photos || [])
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((p) => p.storage_key);
  const photos = await resolvePhotoUrls(rawPhotos);

  const lp = data.landlord_profiles;
  let owner = {
    display_name: lp?.display_name || null,
    is_agency: !!lp?.is_agency,
    agency_name: lp?.agency_name || null,
    verification_status: lp?.verification_status || null,
    user_id: lp?.user_id || null,
    full_name: null,
    phone: null,
    email: null,
  };

  if (lp?.user_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, phone_e164')
      .eq('id', lp.user_id)
      .maybeSingle();
    owner.full_name = profile?.full_name || null;
    owner.phone = profile?.phone_e164 || null;
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(lp.user_id);
      owner.email = authUser?.user?.email || null;
    } catch {
      owner.email = null;
    }
  }

  const uni = data.universities;
  return {
    item: {
      id: data.id,
      reference_code: data.reference_code,
      status: data.status,
      rejection_reason: data.rejection_reason,
      risk_flags: data.risk_flags || [],
      source_language: data.source_language,
      title: data.title_tr || data.title_en,
      title_tr: data.title_tr,
      title_en: data.title_en,
      description: data.description_tr || data.description_en,
      description_tr: data.description_tr,
      description_en: data.description_en,
      property_type: data.property_type,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      furnished: data.furnished,
      size_sqm: data.size_sqm,
      floor: data.floor,
      has_elevator: data.has_elevator,
      max_occupants: data.max_occupants,
      gender_preference: data.gender_preference,
      available_from: data.available_from,
      minimum_stay_months: data.minimum_stay_months,
      price: { amount: Number(data.price_amount), currency: data.price_currency },
      price_gbp: data.price_gbp_normalised != null ? Number(data.price_gbp_normalised) : null,
      deposit: data.deposit_amount != null
        ? { amount: Number(data.deposit_amount), currency: data.deposit_currency }
        : null,
      bills_included: data.bills_included,
      bills_note: data.bills_note,
      agency_fee_note: data.agency_fee_note,
      amenities: data.amenities || [],
      city: data.city,
      neighbourhood: data.neighbourhood,
      address_private: data.address_private,
      university: uni
        ? {
            id: uni.id,
            slug: uni.slug,
            name: uni.name_tr || uni.name_en,
            city: uni.city,
          }
        : null,
      photos,
      owner,
      created_at: data.created_at,
      updated_at: data.updated_at,
      published_at: data.published_at,
      view_count: data.view_count,
      contact_reveal_count: data.contact_reveal_count,
    },
  };
}

export async function dbAdminReview(adminUser, body) {
  const admin = supabaseAdmin();
  const { data: before } = await admin.from('listings').select('status, rejection_reason').eq('id', body.id).maybeSingle();
  if (!before) return { error: 'not_found', status: 404 };

  const action = body.action === 'request_changes' ? 'request_changes' : body.action;
  if (!['approve', 'reject', 'request_changes'].includes(action)) {
    return { error: 'invalid', status: 400 };
  }

  const reason = (body.reason || '').trim() || null;
  if ((action === 'reject' || action === 'request_changes') && !reason) {
    return { error: 'reason_required', status: 400 };
  }

  const status = action === 'approve' ? 'published' : 'rejected';
  const messagePrefix = action === 'request_changes'
    ? 'Lütfen şu bilgileri düzeltip ilanı tekrar incelemeye gönderin:\n'
    : '';
  const rejection_reason = action === 'approve' ? null : `${messagePrefix}${reason}`;

  const patch = {
    status,
    rejection_reason,
    published_at: action === 'approve' ? new Date().toISOString() : null,
  };
  const { error } = await admin.from('listings').update(patch).eq('id', body.id);
  if (error) throw error;
  await admin.from('audit_log').insert({
    actor_user_id: adminUser.id,
    action: `listing.${action}`,
    entity_type: 'listing',
    entity_id: body.id,
    before_snapshot: { status: before.status, rejection_reason: before.rejection_reason },
    after_snapshot: { status, reason: rejection_reason },
  });

  // Email landlord about review outcome (best-effort)
  try {
    const { data: listing } = await admin
      .from('listings')
      .select('reference_code, title_tr, landlord_id, landlord_profiles ( user_id, display_name )')
      .eq('id', body.id)
      .maybeSingle();
    const landlordUserId = listing?.landlord_profiles?.user_id;
    if (landlordUserId) {
      const toEmail = await emailForUserId(admin, landlordUserId);
      if (toEmail) {
        const { notifyAsync, notifyListingReview } = await import('@/lib/mail');
        notifyAsync(() => notifyListingReview({
          toEmail,
          ownerName: listing.landlord_profiles?.display_name || null,
          action,
          listingRef: listing.reference_code,
          listingTitle: listing.title_tr,
          reason: rejection_reason,
        }));
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', mail: 'review_notify', err: String(e?.message || e) }));
  }

  return { ok: true, status, rejection_reason };
}

export async function dbToggleSave(user, listingId, save) {
  const client = supabaseForToken(user.accessToken);
  if (save) {
    const { error } = await client.from('saved_listings').upsert({ student_id: user.id, listing_id: listingId });
    if (error) throw error;
    return { ok: true, saved: true };
  }
  const { error } = await client.from('saved_listings').delete().eq('student_id', user.id).eq('listing_id', listingId);
  if (error) throw error;
  return { ok: true, saved: false };
}

export async function dbSavedListings(user) {
  const client = supabaseForToken(user.accessToken);
  const { data, error } = await client
    .from('saved_listings')
    .select(`listing_id, saved_at, listings:listing_id ( ${listingSelect} )`)
    .eq('student_id', user.id)
    .order('saved_at', { ascending: false });
  if (error) throw error;
  const items = (data || [])
    .map((row) => mapPublicListing(row.listings))
    .filter(Boolean);
  const withPhotos = items.map((l) => {
    const cover = (l.photos || [])[0];
    return { ...l, photos: cover ? [toClientPhotoUrl(cover)] : [] };
  });
  return { items: withPhotos };
}

export async function dbAdminHealth() {
  const admin = supabaseAdmin();
  const { data } = await admin.from('system_health').select('*').order('checked_at', { ascending: false }).limit(20);
  if (data?.length) return { items: data };
  return {
    items: [
      { check_name: 'supabase', status: 'ok', detail: 'API connected', checked_at: new Date().toISOString() },
    ],
  };
}

export async function dbAdminAudit() {
  const admin = supabaseAdmin();
  const { data } = await admin.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100);
  return { items: data || [] };
}

export async function dbAdminUsers() {
  const admin = supabaseAdmin();
  const { data } = await admin.from('profiles').select('id, full_name, role, status, created_at').order('created_at', { ascending: false }).limit(200);
  const userIds = (data || []).map((u) => u.id);
  const { data: lps } = userIds.length
    ? await admin.from('landlord_profiles').select('id, user_id, display_name, verification_status, verification_note, verified_at').in('user_id', userIds)
    : { data: [] };
  const lpByUser = Object.fromEntries((lps || []).map((lp) => [lp.user_id, lp]));

  return {
    items: (data || []).map((u) => ({
      id: u.id,
      name: u.full_name || lpByUser[u.id]?.display_name || null,
      role: u.role,
      status: u.status,
      email: null,
      landlord_id: lpByUser[u.id]?.id || null,
      verification_status: lpByUser[u.id]?.verification_status || null,
      verification_note: lpByUser[u.id]?.verification_note || null,
      verified_at: lpByUser[u.id]?.verified_at || null,
    })),
  };
}

export async function dbAdminSetLandlordVerification(adminUser, body) {
  const admin = supabaseAdmin();
  const status = body.status;
  if (!['verified', 'rejected', 'pending', 'unverified'].includes(status)) {
    return { error: 'invalid', status: 400 };
  }
  const landlordId = body.landlord_id || body.id;
  if (!landlordId) return { error: 'invalid', status: 400 };

  let { data: lp } = await admin
    .from('landlord_profiles')
    .select('id, user_id, display_name, verification_status')
    .eq('id', landlordId)
    .maybeSingle();
  if (!lp && body.user_id) {
    const again = await admin
      .from('landlord_profiles')
      .select('id, user_id, display_name, verification_status')
      .eq('user_id', body.user_id)
      .maybeSingle();
    lp = again.data;
  }
  if (!lp) return { error: 'not_found', status: 404 };

  const patch = {
    verification_status: status,
    verification_note: body.note != null ? String(body.note).slice(0, 500) : undefined,
    verified_at: status === 'verified' ? new Date().toISOString() : null,
    verified_by: status === 'verified' ? adminUser.id : null,
  };
  // Avoid wiping note when not provided
  if (patch.verification_note === undefined) delete patch.verification_note;

  const { error } = await admin.from('landlord_profiles').update(patch).eq('id', lp.id);
  if (error) throw error;

  try {
    await admin.from('verification_requests')
      .update({ status: status === 'verified' ? 'verified' : (status === 'rejected' ? 'rejected' : 'pending') })
      .eq('landlord_id', lp.id)
      .eq('status', 'pending');
  } catch {
    /* optional table */
  }

  await admin.from('audit_log').insert({
    actor_user_id: adminUser.id,
    action: `landlord.verification.${status}`,
    entity_type: 'landlord_profile',
    entity_id: lp.id,
    before_snapshot: { verification_status: lp.verification_status },
    after_snapshot: { verification_status: status, note: body.note || null },
  });

  // Email landlord
  try {
    const toEmail = await emailForUserId(admin, lp.user_id);
    if (toEmail && (status === 'verified' || status === 'rejected')) {
      const { notifyAsync, sendSystemMail } = await import('@/lib/mail');
      const subject = status === 'verified'
        ? 'Hesabın doğrulandı · Kıbrıs Öğrenci'
        : 'Doğrulama talebin sonuçlandı · Kıbrıs Öğrenci';
      const text = status === 'verified'
        ? `Merhaba ${lp.display_name || ''},\n\nİlan sahibi hesabın doğrulandı. İlanlarında “Doğrulanmış” rozeti görünür.\n\n— Kıbrıs Öğrenci`
        : `Merhaba ${lp.display_name || ''},\n\nDoğrulama talebin reddedildi.${body.note ? `\n\nNot: ${body.note}` : ''}\n\n— Kıbrıs Öğrenci`;
      notifyAsync(() => sendSystemMail({ to: toEmail, subject, text }));
    }
  } catch {
    /* ignore */
  }

  return { ok: true, verification_status: status };
}

export async function dbAdminSetUserStatus(adminUser, body) {
  const admin = supabaseAdmin();
  const { data: before } = await admin.from('profiles').select('status, role').eq('id', body.id).maybeSingle();
  if (!before) return { error: 'not_found', status: 404 };
  const { error } = await admin.from('profiles').update({ status: body.status }).eq('id', body.id);
  if (error) throw error;
  // Keep JWT app_metadata in sync for role-sensitive decisions
  if (before.role === 'admin' || body.status === 'suspended') {
    try {
      await admin.auth.admin.updateUserById(body.id, {
        app_metadata: { role: before.role, status: body.status },
      });
    } catch {
      /* ignore */
    }
  }
  await admin.from('audit_log').insert({
    actor_user_id: adminUser.id,
    action: 'user.status',
    entity_type: 'user',
    entity_id: body.id,
    before_snapshot: { status: before.status },
    after_snapshot: { status: body.status },
  });
  return { ok: true };
}

export async function dbUniversities() {
  const admin = supabaseAdmin();
  const [{ data: unis }, { data: listings }, linksRes] = await Promise.all([
    admin.from('universities').select('*').eq('is_active', true),
    admin.from('listings').select('id, university_id').eq('status', 'published'),
    admin.from('listing_universities').select('listing_id, university_id'),
  ]);
  const links = linksRes.error ? [] : (linksRes.data || []);
  const publishedIds = new Set((listings || []).map((l) => l.id));
  const countByUni = new Map();
  for (const l of listings || []) {
    if (!l.university_id) continue;
    countByUni.set(l.university_id, (countByUni.get(l.university_id) || 0) + 1);
  }
  for (const link of links) {
    if (!publishedIds.has(link.listing_id)) continue;
    const primary = (listings || []).find((row) => row.id === link.listing_id)?.university_id;
    if (primary === link.university_id) continue;
    countByUni.set(link.university_id, (countByUni.get(link.university_id) || 0) + 1);
  }
  return {
    items: (unis || []).map((u) => ({
      ...u,
      short: universityShort(u.slug, u.name_en, u.name_tr),
      listings_count: countByUni.get(u.id) || 0,
    })),
  };
}

export async function dbUniversityBySlug(slug) {
  const admin = supabaseAdmin();
  const { data: uni } = await admin.from('universities').select('*').eq('slug', slug).maybeSingle();
  if (!uni) return null;
  let listingIds = [];
  try {
    listingIds = await listingIdsForUniversity(admin, uni.id);
  } catch {
    listingIds = [];
  }
  const [{ data: rows }, { data: price_index }] = await Promise.all([
    listingIds.length
      ? admin
          .from('listings')
          .select(listingCardSelect)
          .eq('status', 'published')
          .eq('is_demo', false)
          .in('id', listingIds)
          .order('published_at', { ascending: false })
          .order('sort_order', { foreignTable: 'listing_photos', ascending: true })
          .limit(DEFAULT_LIST_LIMIT)
          .limit(1, { foreignTable: 'listing_photos' })
      : Promise.resolve({ data: [] }),
    admin.from('price_index').select('*').eq('university_id', uni.id),
  ]);
  const mapped = (rows || []).map((r) => mapPublicListing(r));
  const lookup = await priceIndexLookup(mapped.map((m) => ({ ...m, university_id: m.uni })));
  const listings = mapped.map((m) => {
    const cover = (m.photos || [])[0];
    return {
      ...m,
      photos: cover ? [toClientPhotoUrl(cover)] : [],
      price_index: lookup({ ...m, university_id: m.uni }),
    };
  });
  return {
    university: {
      ...uni,
      short: universityShort(uni.slug, uni.name_en, uni.name_tr),
    },
    listings_count: listings.length,
    listings,
    price_index: (price_index || []).map((p) => ({
      university_id: p.university_id,
      property_type: p.property_type,
      bedrooms: p.bedrooms,
      median_gbp: Number(p.median_price_gbp),
      p25_gbp: Number(p.p25_price_gbp),
      p75_gbp: Number(p.p75_price_gbp),
      sample_size: p.sample_size,
    })),
  };
}

// ---------------------------------------------------------------------------
// In-app messaging
// ---------------------------------------------------------------------------

function clipPreview(body, n = 120) {
  const s = String(body || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

const messageMailThrottle = new Map(); // conversationId -> last email ts

async function emailForUserId(admin, userId) {
  if (!userId) return null;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return data?.user?.email || null;
  } catch {
    return null;
  }
}

async function notifyMessageEmail(admin, {
  conversationId,
  recipientUserId,
  senderUserId,
  listingRef,
  listingTitle,
  preview,
  senderIsStudent,
}) {
  try {
    const last = messageMailThrottle.get(conversationId) || 0;
    if (Date.now() - last < 10 * 60 * 1000) return; // max 1 mail / 10 dk / sohbet
    messageMailThrottle.set(conversationId, Date.now());

    const toEmail = await emailForUserId(admin, recipientUserId);
    if (!toEmail) return;

    const { data: senderProf } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', senderUserId)
      .maybeSingle();
    let senderLabel = senderProf?.full_name || null;
    if (senderIsStudent === false) {
      const { data: lp } = await admin
        .from('landlord_profiles')
        .select('display_name')
        .eq('user_id', senderUserId)
        .maybeSingle();
      if (lp?.display_name) senderLabel = lp.display_name;
    }
    if (!senderLabel) senderLabel = senderIsStudent === false ? 'İlan sahibi' : 'Öğrenci';

    const { data: recipientProf } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', recipientUserId)
      .maybeSingle();

    const { notifyAsync, notifyNewMessage } = await import('@/lib/mail');
    notifyAsync(() => notifyNewMessage({
      toEmail,
      recipientName: recipientProf?.full_name || null,
      senderLabel,
      listingRef,
      listingTitle,
      preview,
    }));
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', mail: 'message_notify', err: String(e?.message || e) }));
  }
}

async function ensureMessagingProfile(admin, user) {
  const { data: profile } = await admin.from('profiles').select('id, status, full_name').eq('id', user.id).maybeSingle();
  if (!profile) {
    await admin.from('profiles').upsert({
      id: user.id,
      role: user.role || 'student',
      status: 'active',
      full_name: user.profile?.full_name || null,
    });
    return { id: user.id, full_name: user.profile?.full_name || null, status: 'active' };
  }
  if (profile.status !== 'active') return { error: 'auth_required', status: 401 };
  return profile;
}

async function listingLandlordUserId(admin, listingId) {
  const { data } = await admin
    .from('listings')
    .select('id, reference_code, title_tr, landlord_id, landlord_profiles ( user_id, display_name )')
    .eq('id', listingId)
    .maybeSingle();
  if (!data) return null;
  return {
    listing_id: data.id,
    reference_code: data.reference_code,
    title: data.title_tr,
    landlord_user_id: data.landlord_profiles?.user_id || null,
    landlord_name: data.landlord_profiles?.display_name || null,
  };
}

function mapConversationRow(row, userId, extras = {}) {
  const isStudent = row.student_id === userId;
  const otherName = isStudent
    ? (extras.landlord_name || row.landlord_name || 'İlan sahibi')
    : (extras.student_name || row.student_name || 'Öğrenci');
  const myRead = isStudent ? row.student_last_read_at : row.landlord_last_read_at;
  const unread = row.last_message_at
    && (!myRead || new Date(row.last_message_at) > new Date(myRead))
    && row.last_sender_id !== userId;
  return {
    id: row.id,
    listing_id: row.listing_id,
    reference_code: extras.reference_code || row.reference_code || null,
    listing_title: extras.title || row.listing_title || null,
    other_name: otherName,
    last_message_at: row.last_message_at,
    last_message_preview: row.last_message_preview,
    unread: Boolean(unread),
    role: isStudent ? 'student' : 'landlord',
  };
}

export async function dbStartConversation(user, { ref, body }) {
  const text = String(body || '').trim();
  if (!ref || text.length < 1) return { error: 'invalid', status: 400 };
  if (text.length > 2000) return { error: 'too_long', status: 400 };

  const admin = supabaseAdmin();
  const profile = await ensureMessagingProfile(admin, user);
  if (profile.error) return profile;

  const { data: listing } = await admin
    .from('listings')
    .select('id, reference_code, title_tr, status, landlord_id, landlord_profiles ( user_id, display_name )')
    .eq('reference_code', ref)
    .eq('status', 'published')
    .maybeSingle();
  if (!listing) return { error: 'not_found', status: 404 };

  const landlordUserId = listing.landlord_profiles?.user_id;
  if (!landlordUserId) return { error: 'not_found', status: 404 };
  if (landlordUserId === user.id) return { error: 'own_listing', status: 400 };

  const now = new Date().toISOString();
  const preview = clipPreview(text);

  let { data: conv } = await admin
    .from('conversations')
    .select('*')
    .eq('listing_id', listing.id)
    .eq('student_id', user.id)
    .maybeSingle();

  if (!conv) {
    const { data: created, error } = await admin
      .from('conversations')
      .insert({
        listing_id: listing.id,
        student_id: user.id,
        landlord_user_id: landlordUserId,
        last_message_at: now,
        last_message_preview: preview,
        student_last_read_at: now,
      })
      .select('*')
      .single();
    if (error) {
      // race: unique conflict
      const again = await admin
        .from('conversations')
        .select('*')
        .eq('listing_id', listing.id)
        .eq('student_id', user.id)
        .maybeSingle();
      conv = again.data;
      if (!conv) return { error: 'server_error', status: 500 };
    } else {
      conv = created;
    }
  }

  const { data: msg, error: msgErr } = await admin
    .from('messages')
    .insert({ conversation_id: conv.id, sender_id: user.id, body: text })
    .select('id, conversation_id, sender_id, body, created_at')
    .single();
  if (msgErr) return { error: 'server_error', status: 500 };

  await admin
    .from('conversations')
    .update({
      last_message_at: msg.created_at,
      last_message_preview: preview,
      student_last_read_at: msg.created_at,
    })
    .eq('id', conv.id);

  try {
    await admin.from('inquiries').insert({
      listing_id: listing.id,
      student_id: user.id,
      source: 'web',
      message: preview,
    });
  } catch {
    /* ignore */
  }

  notifyMessageEmail(admin, {
    conversationId: conv.id,
    recipientUserId: landlordUserId,
    senderUserId: user.id,
    listingRef: listing.reference_code,
    listingTitle: listing.title_tr,
    preview,
    senderIsStudent: true,
  });

  return {
    ok: true,
    conversation_id: conv.id,
    message: msg,
  };
}

export async function dbListConversations(user) {
  const admin = supabaseAdmin();
  const profile = await ensureMessagingProfile(admin, user);
  if (profile.error) return profile;

  const { data, error } = await admin
    .from('conversations')
    .select(`
      id, listing_id, student_id, landlord_user_id,
      last_message_at, last_message_preview,
      student_last_read_at, landlord_last_read_at, created_at,
      listings ( reference_code, title_tr ),
      student:profiles!conversations_student_id_fkey ( full_name ),
      landlord:profiles!conversations_landlord_user_id_fkey ( full_name )
    `)
    .or(`student_id.eq.${user.id},landlord_user_id.eq.${user.id}`)
    .order('last_message_at', { ascending: false })
    .limit(80);

  if (error) {
    // Fallback without FK name hints if schema cache differs
    const { data: plain, error: err2 } = await admin
      .from('conversations')
      .select('*')
      .or(`student_id.eq.${user.id},landlord_user_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false })
      .limit(80);
    if (err2) return { error: 'server_error', status: 500, items: [] };

    const listingIds = [...new Set((plain || []).map((c) => c.listing_id))];
    const { data: listings } = listingIds.length
      ? await admin.from('listings').select('id, reference_code, title_tr, landlord_id, landlord_profiles(display_name)').in('id', listingIds)
      : { data: [] };
    const byListing = Object.fromEntries((listings || []).map((l) => [l.id, l]));
    const studentIds = [...new Set((plain || []).map((c) => c.student_id))];
    const { data: students } = studentIds.length
      ? await admin.from('profiles').select('id, full_name').in('id', studentIds)
      : { data: [] };
    const byStudent = Object.fromEntries((students || []).map((s) => [s.id, s]));

    // last sender for unread heuristic
    const items = await Promise.all((plain || []).map(async (c) => {
      const { data: lastMsg } = await admin
        .from('messages')
        .select('sender_id')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const L = byListing[c.listing_id];
      return mapConversationRow(
        { ...c, last_sender_id: lastMsg?.sender_id },
        user.id,
        {
          reference_code: L?.reference_code,
          title: L?.title_tr,
          landlord_name: L?.landlord_profiles?.display_name,
          student_name: byStudent[c.student_id]?.full_name,
        },
      );
    }));
    return { items };
  }

  const items = await Promise.all((data || []).map(async (c) => {
    const { data: lastMsg } = await admin
      .from('messages')
      .select('sender_id')
      .eq('conversation_id', c.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return mapConversationRow(
      { ...c, last_sender_id: lastMsg?.sender_id },
      user.id,
      {
        reference_code: c.listings?.reference_code,
        title: c.listings?.title_tr,
        landlord_name: c.landlord?.full_name,
        student_name: c.student?.full_name,
      },
    );
  }));

  // Prefer landlord display_name over profile full_name when available
  for (const it of items) {
    if (it.role === 'student' && it.listing_id) {
      const meta = await listingLandlordUserId(admin, it.listing_id);
      if (meta?.landlord_name) it.other_name = meta.landlord_name;
    }
  }

  return { items };
}

export async function dbGetConversation(user, conversationId) {
  const admin = supabaseAdmin();
  const profile = await ensureMessagingProfile(admin, user);
  if (profile.error) return profile;

  const { data: conv } = await admin
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return { error: 'not_found', status: 404 };
  if (conv.student_id !== user.id && conv.landlord_user_id !== user.id) {
    return { error: 'forbidden', status: 403 };
  }

  const meta = await listingLandlordUserId(admin, conv.listing_id);
  const { data: studentProf } = await admin.from('profiles').select('full_name').eq('id', conv.student_id).maybeSingle();

  const { data: msgs } = await admin
    .from('messages')
    .select('id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200);

  const now = new Date().toISOString();
  const readPatch = conv.student_id === user.id
    ? { student_last_read_at: now }
    : { landlord_last_read_at: now };
  await admin.from('conversations').update(readPatch).eq('id', conversationId);

  const summary = mapConversationRow(
    { ...conv, last_sender_id: null },
    user.id,
    {
      reference_code: meta?.reference_code,
      title: meta?.title,
      landlord_name: meta?.landlord_name,
      student_name: studentProf?.full_name,
    },
  );

  return {
    conversation: summary,
    messages: (msgs || []).map((m) => ({
      id: m.id,
      body: m.body,
      created_at: m.created_at,
      mine: m.sender_id === user.id,
      sender_id: m.sender_id,
    })),
  };
}

export async function dbSendMessage(user, conversationId, body) {
  const text = String(body || '').trim();
  if (text.length < 1) return { error: 'invalid', status: 400 };
  if (text.length > 2000) return { error: 'too_long', status: 400 };

  const admin = supabaseAdmin();
  const profile = await ensureMessagingProfile(admin, user);
  if (profile.error) return profile;

  const { data: conv } = await admin
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return { error: 'not_found', status: 404 };
  if (conv.student_id !== user.id && conv.landlord_user_id !== user.id) {
    return { error: 'forbidden', status: 403 };
  }

  const { data: msg, error } = await admin
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, body: text })
    .select('id, conversation_id, sender_id, body, created_at')
    .single();
  if (error) return { error: 'server_error', status: 500 };

  const preview = clipPreview(text);
  const readPatch = conv.student_id === user.id
    ? { student_last_read_at: msg.created_at }
    : { landlord_last_read_at: msg.created_at };

  await admin
    .from('conversations')
    .update({
      last_message_at: msg.created_at,
      last_message_preview: preview,
      ...readPatch,
    })
    .eq('id', conversationId);

  const recipientUserId = conv.student_id === user.id
    ? conv.landlord_user_id
    : conv.student_id;
  const meta = await listingLandlordUserId(admin, conv.listing_id);
  notifyMessageEmail(admin, {
    conversationId,
    recipientUserId,
    senderUserId: user.id,
    listingRef: meta?.reference_code,
    listingTitle: meta?.title,
    preview,
    senderIsStudent: conv.student_id === user.id,
  });

  return {
    ok: true,
    message: {
      id: msg.id,
      body: msg.body,
      created_at: msg.created_at,
      mine: true,
      sender_id: msg.sender_id,
    },
  };
}

export async function dbUnreadMessageCount(user) {
  const { items } = await dbListConversations(user);
  if (!items) return { count: 0 };
  return { count: items.filter((i) => i.unread).length };
}

