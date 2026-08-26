import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  LISTINGS, UNIVERSITIES, PACKAGES, PRICE_INDEX, FX_TO_GBP, CURRENCIES,
  toGbp, findIndex, publicListing, getListingByRef, HERO_IMAGE,
} from '@/lib/seed';
import { getRequestUser, requireUser, requireAdmin, isMockMode, allowMockDemoAuth, hashIp } from '@/lib/auth';
import * as db from '@/lib/db';
import { KKTC_CITIES, slugifyUniversityName, universityShort } from '@/lib/universities';
import { FX_FALLBACK_TO_GBP, getLiveFxToGbp } from '@/lib/fx';
import {
  comparePremiumThenDate,
  computePremiumUntil,
  getPremiumPlan,
  mapPremiumFields,
} from '@/lib/premium';

const json = (data, status = 200, cache = 'no-store') =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': cache } });

const PUBLIC_CACHE = 'public, max-age=30, s-maxage=60, stale-while-revalidate=300';

const CITY_FALLBACK = {
  Girne: { lat: 35.341, lng: 33.317 },
  Lefkoşa: { lat: 35.185, lng: 33.382 },
  Gazimağusa: { lat: 35.125, lng: 33.94 },
  Güzelyurt: { lat: 35.199, lng: 32.993 },
  Lefke: { lat: 35.112, lng: 32.85 },
  İskele: { lat: 35.287, lng: 33.892 },
};

// ---- mock stores (dev / MOCK_MODE only) ----
const revealCounts = new Map();
const DAILY_REVEAL_LIMIT = 15;
const userListings = [];
const auditLog = [];
const waProcessed = new Set();
const waOptOut = new Set();
let waSpendCents = 0;
const WA_SPEND_CEILING = 500;
const reports = [
  { id: 'rep-seed-1', ref: 'M9C2W7', reason: 'scam', detail: 'Görmeden kapora istiyor', status: 'open', count: 2, created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
];
const users = [
  { id: 'usr-adm', name: 'Admin', role: 'admin', status: 'active', email: 'admin@kibrisogrenci.com' },
  { id: 'usr-1', name: 'Ayşe Yılmaz', role: 'landlord', status: 'active', email: 'ayse@demo' },
];
const invoices = [
  { id: 'inv-1', user: 'Ayşe Yılmaz', package: 'Pro', amount: 2000, currency: 'TRY', status: 'paid', bank_reference: 'KO-PRO-AYSE-01', issued_at: new Date(Date.now() - 20 * 86400000).toISOString() },
];
/** Mock admin review outcomes for seed + created listings: id -> { status, rejection_reason } */
const listingModeration = new Map();
/** Mock admin-deleted listing ids (seed listings cannot be spliced from LISTINGS) */
const deletedListingIds = new Set();
/** Mock in-app chat: { id, listing_id, ref, student_id, landlord_user_id, ... messages } */
const mockConversations = [];
const mockMessages = [];

function mockClip(s, n = 120) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function mockAdminListingDetail(id) {
  const created = userListings.find((u) => u.id === id);
  if (created) {
    return {
      item: {
        id: created.id,
        reference_code: created.reference_code,
        status: listingModeration.get(id)?.status || created.status,
        rejection_reason: listingModeration.get(id)?.rejection_reason || created.rejection_reason || null,
        risk_flags: created.risk_flags || [],
        title: created.title,
        title_tr: created.title,
        description: created.description || '',
        property_type: created.property_type || 'apartment',
        bedrooms: created.bedrooms ?? 1,
        bathrooms: created.bathrooms ?? 1,
        furnished: created.furnished !== false,
        size_sqm: created.size_sqm || null,
        max_occupants: created.max_occupants || null,
        gender_preference: created.gender_preference || 'any',
        available_from: created.available_from || null,
        minimum_stay_months: created.minimum_stay_months || null,
        price: created.price,
        deposit: created.deposit || null,
        bills_included: !!created.bills_included,
        bills_note: created.bills_note || '',
        agency_fee_note: created.agency_fee_note || '',
        amenities: created.amenities || [],
        city: created.city,
        neighbourhood: created.neighbourhood || '',
        address_private: created.address_private || '',
        university: created.university_id
          ? (() => {
              const u = UNIVERSITIES.find((x) => x.id === created.university_id);
              return u ? { id: u.id, slug: u.slug, name: u.name_tr, city: u.city } : null;
            })()
          : null,
        photos: created.photos || (created.photo ? [created.photo] : [LISTINGS[0].photos[0]]),
        owner: {
          display_name: created.owner,
          full_name: created.owner,
          phone: created.phone || null,
          email: null,
          is_agency: false,
          verification_status: 'pending',
        },
        created_at: created.created_at,
        view_count: created.view_count || 0,
        contact_reveal_count: created.contact_reveal_count || 0,
      },
    };
  }

  const l = LISTINGS.find((x) => x.id === id);
  if (!l) return null;
  const mod = listingModeration.get(id);
  const uni = UNIVERSITIES.find((u) => u.id === l.uni);
  return {
    item: {
      id: l.id,
      reference_code: l.reference_code,
      status: mod?.status || 'pending_review',
      rejection_reason: mod?.rejection_reason || null,
      risk_flags: l.risk_flags || [],
      title: l.title_tr,
      title_tr: l.title_tr,
      title_en: l.title_en,
      description: l.description_tr,
      description_tr: l.description_tr,
      description_en: l.description_en,
      property_type: l.property_type,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      furnished: l.furnished,
      size_sqm: l.size_sqm,
      max_occupants: l.max_occupants,
      gender_preference: l.gender_preference,
      roommate_criteria: l.roommate_criteria || {
        marital_status: 'any', age_min: null, age_max: null, employment: 'any',
        university_id: null, pets: 'any', smoking: 'any',
      },
      roommate_university: (() => {
        const uid = l.roommate_criteria?.university_id;
        if (!uid) return null;
        const u = UNIVERSITIES.find((x) => x.id === uid);
        return u ? { id: u.id, slug: u.slug, name: u.name_tr, city: u.city } : null;
      })(),
      available_from: l.available_from,
      minimum_stay_months: l.minimum_stay_months,
      price: l.price,
      deposit: l.deposit || null,
      bills_included: l.bills_included,
      bills_note: l.bills_note,
      agency_fee_note: l.agency_fee_note,
      amenities: l.amenities || [],
      city: l.city,
      neighbourhood: l.neighbourhood,
      address_private: `${l.neighbourhood}, ${l.city} — örnek gizli adres ${l.reference_code}`,
      university: uni ? { id: uni.id, slug: uni.slug, name: uni.name_tr, city: uni.city } : null,
      photos: l.photos || [],
      owner: {
        display_name: l.landlord.name,
        full_name: l.landlord.name,
        phone: l.landlord.phone,
        email: null,
        is_agency: !!l.landlord.is_agency,
        agency_name: l.landlord.is_agency ? l.landlord.name : null,
        verification_status: l.landlord.verified ? 'verified' : 'pending',
      },
      created_at: l.published_at || new Date().toISOString(),
      view_count: l.view_count || 0,
      contact_reveal_count: l.contact_reveal_count || 0,
    },
  };
}

function audit(actor, action, entity_type, entity_id, before, after) {
  auditLog.unshift({
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actor_user: actor, action, entity_type, entity_id,
    before_snapshot: before || null, after_snapshot: after || null,
    created_at: new Date().toISOString(),
  });
}

function walkMinutes(m) { return Math.round((m / 4500) * 60); }

function priceIndexInfo(l) {
  const pi = findIndex(l.uni, l.property_type, l.bedrooms);
  if (!pi || pi.sample_size < 5) return { enough: false, sample_size: pi ? pi.sample_size : 0 };
  const ratio = l.price_gbp / pi.median_gbp;
  const pct = Math.round(Math.abs(1 - ratio) * 100);
  let position = 'at';
  if (ratio < 0.97) position = 'below';
  else if (ratio > 1.03) position = 'above';
  return {
    enough: true, median_gbp: pi.median_gbp, p25_gbp: pi.p25_gbp, p75_gbp: pi.p75_gbp,
    sample_size: pi.sample_size, ratio: +ratio.toFixed(3), pct, position,
  };
}

function filterListings(sp) {
  let items = LISTINGS.slice();
  const g = (k) => sp.get(k);
  if (g('university')) items = items.filter((l) => l.uni === g('university'));
  if (g('city')) items = items.filter((l) => l.city === g('city'));
  if (g('property_type')) items = items.filter((l) => l.property_type === g('property_type'));
  if (g('bedrooms') != null && g('bedrooms') !== '') items = items.filter((l) => String(l.bedrooms) === String(g('bedrooms')));
  if (g('furnished') === 'true') items = items.filter((l) => l.furnished);
  if (g('bills_included') === 'true') items = items.filter((l) => l.bills_included);
  if (g('gender')) items = items.filter((l) => l.gender_preference === 'any' || l.gender_preference === g('gender'));
  if (g('verified_only') === 'true') items = items.filter((l) => l.landlord.verified);
  if (g('max_walk')) items = items.filter((l) => walkMinutes(l.distance_m) <= Number(g('max_walk')));
  if (g('max_distance_m')) items = items.filter((l) => l.distance_m != null && l.distance_m <= Number(g('max_distance_m')));
  const amen = (g('amenities') || '').split(',').filter(Boolean);
  if (amen.length) items = items.filter((l) => amen.every((a) => l.amenities.includes(a)));
  if (g('price_min')) items = items.filter((l) => l.price_gbp >= Number(g('price_min')));
  if (g('price_max')) items = items.filter((l) => l.price_gbp <= Number(g('price_max')));
  if (g('featured') === '1') {
    items = items.filter((l) => {
      const p = mapPremiumFields(l);
      return p.featured || l.featured;
    });
    if (!items.length) {
      items = LISTINGS.slice().filter((l) => l.featured);
    }
  }
  const sort = g('sort') || 'new';
  if (sort === 'price_asc') items.sort((a, b) => a.price_gbp - b.price_gbp);
  else if (sort === 'price_desc') items.sort((a, b) => b.price_gbp - a.price_gbp);
  else if (sort === 'distance') items.sort((a, b) => a.distance_m - b.distance_m);
  else if (sort === 'near') {
    const nearLat = Number(g('near_lat') || NaN);
    const nearLng = Number(g('near_lng') || NaN);
    if (Number.isFinite(nearLat) && Number.isFinite(nearLng)) {
      const CITY = {
        Girne: { lat: 35.341, lng: 33.317 },
        Lefkoşa: { lat: 35.185, lng: 33.382 },
        Gazimağusa: { lat: 35.125, lng: 33.94 },
        Güzelyurt: { lat: 35.199, lng: 32.993 },
        Lefke: { lat: 35.112, lng: 32.85 },
        İskele: { lat: 35.287, lng: 33.892 },
      };
      const toRad = (d) => (d * Math.PI) / 180;
      const dist = (lat, lng) => {
        const R = 6371000;
        const dLat = toRad(lat - nearLat);
        const dLng = toRad(lng - nearLng);
        const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(nearLat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
      };
      items.sort((a, b) => {
        const ca = CITY[a.city];
        const cb = CITY[b.city];
        const da = ca ? dist(ca.lat, ca.lng) : Number.POSITIVE_INFINITY;
        const db = cb ? dist(cb.lat, cb.lng) : Number.POSITIVE_INFINITY;
        return da - db;
      });
    }
  } else if (g('featured') === '1') {
    items.sort((a, b) => {
      const pa = mapPremiumFields(a);
      const pb = mapPremiumFields(b);
      if ((pb.premium_rank || 0) !== (pa.premium_rank || 0)) {
        return (pb.premium_rank || 0) - (pa.premium_rank || 0);
      }
      return (b.view_count || 0) - (a.view_count || 0);
    });
  } else {
    items.sort(comparePremiumThenDate);
  }
  return items;
}

const OPTOUT_WORDS = ['stop', 'dur', 'iptal', 'i̇ptal', 'стоп', 'arret', 'arrêt', 'توقف'];
function verifyHmac(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function clientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '0.0.0.0';
}

async function handleMock(request, route, path, method, sp) {
  if (route === 'config' && method === 'GET') {
    const mapped = UNIVERSITIES
      .filter((u) => u.is_active !== false)
      .map((u) => ({
        ...u,
        listings_count: LISTINGS.filter((l) => l.uni === u.id).length,
      }));
    let fx_to_gbp = { ...FX_FALLBACK_TO_GBP, ...FX_TO_GBP };
    let fx_source = 'fallback';
    let fx_date = null;
    try {
      const live = await getLiveFxToGbp();
      if (live?.fxToGbp) {
        fx_to_gbp = { ...FX_FALLBACK_TO_GBP, ...live.fxToGbp };
        fx_source = live.source;
        fx_date = live.date;
      }
    } catch { /* keep seed fallback */ }
    return json({
      fx_to_gbp,
      fx_date,
      fx_source,
      currencies: CURRENCIES,
      hero_image: HERO_IMAGE,
      universities: mapped,
      all_universities: mapped, packages: PACKAGES,
      stats: {
        listings: LISTINGS.length, universities: mapped.length,
        verified_landlords: [...new Set(LISTINGS.filter((l) => l.landlord.verified).map((l) => l.landlord.name))].length,
        cities: KKTC_CITIES.length,
      },
      cities: KKTC_CITIES,
      mock: true,
    }, 200, PUBLIC_CACHE);
  }

  if (route === 'listings' && method === 'GET') {
    const items = filterListings(sp);
    const limit = Number(sp.get('limit') || 0);
    const out = (limit ? items.slice(0, limit) : items).map((l) => ({ ...publicListing(l), price_index: priceIndexInfo(l) }));
    return json({ total: items.length, items: out }, 200, PUBLIC_CACHE);
  }

  if (path[0] === 'listings' && path[1] && method === 'GET') {
    const l = getListingByRef(path[1]);
    if (!l) return json({ error: 'not_found' }, 404);
    const uni = UNIVERSITIES.find((u) => u.id === l.uni);
    const criteria = l.roommate_criteria || {
      marital_status: 'any', age_min: null, age_max: null, employment: 'any',
      university_id: null, pets: 'any', smoking: 'any',
    };
    const criteriaUni = criteria.university_id
      ? UNIVERSITIES.find((u) => u.id === criteria.university_id)
      : null;
    const similar = LISTINGS.filter((s) => s.id !== l.id && s.uni === l.uni).slice(0, 3)
      .map((s) => ({ ...publicListing(s), price_index: priceIndexInfo(s) }));
    return json({
      ...publicListing(l),
      roommate_criteria: criteria,
      roommate_university: criteriaUni
        ? { id: criteriaUni.id, slug: criteriaUni.slug, name_tr: criteriaUni.name_tr, name_en: criteriaUni.name_en, short: criteriaUni.short, city: criteriaUni.city }
        : null,
      university: uni ? { id: uni.id, slug: uni.slug, name_tr: uni.name_tr, name_en: uni.name_en, short: uni.short, city: uni.city } : null,
      price_index: priceIndexInfo(l), similar,
    }, 200, PUBLIC_CACHE);
  }

  if (route === 'universities' && method === 'GET') {
    return json({ items: UNIVERSITIES.map((u) => ({ ...u, listings_count: LISTINGS.filter((l) => l.uni === u.id).length })) }, 200, PUBLIC_CACHE);
  }
  if (path[0] === 'universities' && path[1] && method === 'GET') {
    const uni = UNIVERSITIES.find((u) => u.slug === path[1]);
    if (!uni) return json({ error: 'not_found' }, 404);
    const listings = LISTINGS.filter((l) => l.uni === uni.id).map((l) => ({ ...publicListing(l), price_index: priceIndexInfo(l) }));
    return json({ university: uni, listings_count: listings.length, listings, price_index: PRICE_INDEX.filter((p) => p.university_id === uni.id) }, 200, PUBLIC_CACHE);
  }

  // Reveal in mock still requires a real Bearer token when Supabase is configured;
  // otherwise rejects spoofed studentId in production-like runs.
  if (route === 'reveal' && method === 'POST') {
    const user = await getRequestUser(request);
    const denied = requireUser(user);
    if (denied) {
      // Dev-only fallback: only if MOCK_ALLOW_DEMO_AUTH=true (never in production)
      if (!allowMockDemoAuth()) return json(denied, denied.status);
      const body = await request.json().catch(() => ({}));
      if (!body.signedIn || !body.studentId) return json({ error: 'auth_required' }, 401);
      const l = getListingByRef(body.ref);
      if (!l) return json({ error: 'not_found' }, 404);
      const key = `${body.studentId}|${new Date().toISOString().slice(0, 10)}`;
      const count = revealCounts.get(key) || 0;
      if (count >= DAILY_REVEAL_LIMIT) return json({ error: 'rate_limited' }, 429);
      revealCounts.set(key, count + 1);
      const digits = l.landlord.phone.replace(/[^0-9]/g, '');
      const msg = encodeURIComponent(`Merhaba, kibrisogrenci.com'daki ${l.reference_code} numarali ilaniniz hakkinda bilgi almak istiyorum.`);
      return json({ phone: l.landlord.phone, whatsapp_url: `https://wa.me/${digits}?text=${msg}`, reveals_today: count + 1, limit: DAILY_REVEAL_LIMIT });
    }
    const body = await request.json().catch(() => ({}));
    const l = getListingByRef(body.ref);
    if (!l) return json({ error: 'not_found' }, 404);
    const key = `${user.id}|${new Date().toISOString().slice(0, 10)}`;
    const count = revealCounts.get(key) || 0;
    if (count >= DAILY_REVEAL_LIMIT) return json({ error: 'rate_limited' }, 429);
    revealCounts.set(key, count + 1);
    const digits = l.landlord.phone.replace(/[^0-9]/g, '');
    const msg = encodeURIComponent(`Merhaba, kibrisogrenci.com'daki ${l.reference_code} numarali ilaniniz hakkinda bilgi almak istiyorum.`);
    return json({ phone: l.landlord.phone, whatsapp_url: `https://wa.me/${digits}?text=${msg}`, reveals_today: count + 1, limit: DAILY_REVEAL_LIMIT });
  }

  if (route === 'reports' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!body.ref || !body.reason) return json({ error: 'invalid' }, 400);
    const existing = reports.find((r) => r.ref === body.ref && r.reason === body.reason && r.status === 'open');
    if (existing) { existing.count += 1; return json({ ok: true, id: existing.id, collapsed: true }); }
    const rep = { id: `rep-${Date.now()}`, ref: body.ref, reason: body.reason, detail: body.detail || '', status: 'open', count: 1, created_at: new Date().toISOString() };
    reports.unshift(rep);
    return json({ ok: true, id: rep.id });
  }

  // Landlord / admin mock routes require Bearer admin OR MOCK_ALLOW_DEMO_AUTH (dev only)
  if (route.startsWith('my/') || route.startsWith('admin/')) {
    const user = await getRequestUser(request);
    const needsAdmin = route.startsWith('admin/');
    if (!allowMockDemoAuth()) {
      const gate = needsAdmin ? requireAdmin(user) : requireUser(user);
      if (gate) return json(gate, gate.status);
    }
  }

  if (route === 'my/listings' && method === 'GET') {
    const owner = sp.get('owner') || 'Ayşe Yılmaz';
    const mine = LISTINGS.filter((l) => l.landlord.name === owner)
      .map((l) => {
        const prem = mapPremiumFields(l);
        return {
          id: l.id, reference_code: l.reference_code, title: l.title_tr, status: 'published',
          price: l.price, city: l.city, view_count: l.view_count, contact_reveal_count: l.contact_reveal_count,
          photo: l.photos[0], price_index: priceIndexInfo(l),
          premium_tier: prem.premium_tier, premium_until: prem.premium_until, premium: prem.premium,
        };
      })
      .concat(userListings.filter((u) => u.owner === owner).map((u) => {
        const prem = mapPremiumFields(u);
        return { ...u, premium_tier: prem.premium_tier, premium_until: prem.premium_until, premium: prem.premium };
      }));
    const pkg = PACKAGES.find((p) => p.name === 'Pro');
    return json({ items: mine, quota: { used: mine.length, total: pkg.listing_quota, package: pkg.name } });
  }
  if (route === 'my/listings' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const owner = b.owner || 'Ayşe Yılmaz';
    const pkg = PACKAGES.find((p) => p.name === 'Pro');
    const mineCount = LISTINGS.filter((l) => l.landlord.name === owner).length + userListings.filter((u) => u.owner === owner).length;
    if (mineCount >= pkg.listing_quota) return json({ error: 'quota_exceeded' }, 402);
    const ref = Math.random().toString(36).replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
    const item = {
      id: `u-${Date.now()}`, reference_code: ref, owner, title: b.title || 'Yeni ilan',
      status: b.draft ? 'draft' : 'pending_review', price: { amount: Number(b.price_amount) || 0, currency: b.price_currency || 'GBP' },
      city: b.city || 'Girne', property_type: b.property_type || 'apartment', created_at: new Date().toISOString(),
      view_count: 0, contact_reveal_count: 0, photo: LISTINGS[0].photos[0], price_index: { enough: false },
    };
    userListings.unshift(item);
    audit(owner, 'listing.create', 'listing', item.id, null, { status: item.status });
    return json({ ok: true, item });
  }
  if (path[0] === 'my' && path[1] === 'listings' && path[2] && path[3] === 'promote' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const plan = getPremiumPlan(b.plan);
    if (!plan) return json({ error: 'invalid_plan' }, 400);
    const id = path[2];
    const seed = LISTINGS.find((l) => l.id === id);
    const created = userListings.find((u) => u.id === id);
    const target = seed || created;
    if (!target) return json({ error: 'not_found' }, 404);
    if (created && created.status !== 'published') return json({ error: 'listing_not_published' }, 400);
    const until = computePremiumUntil(plan.id);
    target.premium_tier = plan.id;
    target.premium_until = until;
    target.featured = true;
    audit(b.owner || 'Ayşe Yılmaz', 'listing.promote', 'listing', id, null, { plan: plan.id, until });
    const prem = mapPremiumFields(target);
    return json({
      ok: true,
      payment_pending: true,
      item: {
        id: target.id,
        reference_code: target.reference_code,
        title: target.title_tr || target.title,
        status: created?.status || 'published',
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
    });
  }
  if (route === 'my/analytics' && method === 'GET') {
    const weeks = ['-5w', '-4w', '-3w', '-2w', '-1w', 'now'];
    return json({ trend: weeks.map((w, i) => ({ week: w, views: 20 + i * 12 + (i % 2) * 6, reveals: 2 + i, saves: 1 + (i % 3), inquiries: (i % 2) })) });
  }
  if (route === 'my/inquiries' && method === 'GET') {
    return json({ items: [] });
  }
  if (route === 'my/billing' && method === 'GET') {
    const owner = sp.get('owner') || 'Ayşe Yılmaz';
    const activePackages = LISTINGS
      .filter((l) => l.premium_tier && l.landlord?.name === owner)
      .slice(0, 5)
      .map((l) => ({
        listing_id: l.id,
        listing_ref: l.reference_code,
        listing_title: l.title_tr,
        plan_id: l.premium_tier,
        premium_until: l.premium_until || null,
        status: l.status,
      }));
    return json({
      subscription: null,
      active_packages: activePackages,
      invoices: invoices.filter((i) => i.user === owner),
      premium_orders: [],
    });
  }
  if (route === 'my/saved' && method === 'GET') return json({ items: [] });

  if (route === 'admin/listings' && method === 'GET') {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const mapSeed = (l, defaultStatus) => ({
      id: l.id,
      reference_code: l.reference_code,
      title: l.title_tr,
      owner: l.landlord.name,
      status: listingModeration.get(l.id)?.status || defaultStatus,
      city: l.city,
      risk_flags: l.risk_flags || [],
      photo: l.photos?.[0],
      price: l.price,
      view_count: l.view_count || 0,
      contact_reveal_count: l.contact_reveal_count || 0,
      premium_tier: l.premium_tier || null,
      created_at: l.published_at || null,
      updated_at: l.published_at || null,
    });
    const seedItems = LISTINGS.map((l) => mapSeed(l, (l.risk_flags?.length ? 'pending_review' : 'published')));
    const created = userListings.map((u) => ({
      id: u.id,
      reference_code: u.reference_code,
      title: u.title,
      owner: u.owner,
      status: listingModeration.get(u.id)?.status || u.status,
      city: u.city,
      risk_flags: u.risk_flags || [],
      photo: u.photo || u.photos?.[0] || LISTINGS[0]?.photos?.[0],
      price: u.price,
      view_count: u.view_count || 0,
      contact_reveal_count: u.contact_reveal_count || 0,
      premium_tier: null,
      created_at: u.created_at || null,
      updated_at: u.updated_at || u.created_at || null,
    }));
    let items = [...seedItems, ...created].filter((i) => !deletedListingIds.has(i.id));
    if (status && status !== 'all') items = items.filter((i) => i.status === status);
    if (q) {
      items = items.filter((i) =>
        (i.reference_code || '').toLowerCase().includes(q)
        || (i.title || '').toLowerCase().includes(q)
        || (i.city || '').toLowerCase().includes(q)
        || (i.owner || '').toLowerCase().includes(q));
    }
    items.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    return json({ items, total: items.length });
  }
  if (route === 'admin/listings/action' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const action = String(b.action || '').toLowerCase();
    const id = b.id;
    if (!id || !action) return json({ error: 'invalid' }, 400);
    const item = userListings.find((u) => u.id === id);
    const seed = LISTINGS.find((l) => l.id === id);
    const before = item?.status || listingModeration.get(id)?.status || (seed ? 'published' : null);
    if (!before && !item && !seed) return json({ error: 'not_found' }, 404);

    if (action === 'delete') {
      const idx = userListings.findIndex((u) => u.id === id);
      if (idx >= 0) userListings.splice(idx, 1);
      deletedListingIds.add(id);
      listingModeration.delete(id);
      audit('Admin', 'listing.delete', 'listing', id, { status: before }, null);
      return json({ ok: true, deleted: true });
    }
    if (action === 'approve') {
      const status = 'published';
      if (item) item.status = status;
      listingModeration.set(id, { status, rejection_reason: null });
      audit('Admin', 'listing.approve', 'listing', id, { status: before }, { status });
      return json({ ok: true, status });
    }
    if (action === 'unpublish') {
      const status = 'rejected';
      const rejection_reason = b.reason || 'Yönetici tarafından yayından kaldırıldı.';
      if (item) { item.status = status; item.rejection_reason = rejection_reason; }
      listingModeration.set(id, { status, rejection_reason });
      audit('Admin', 'listing.unpublish', 'listing', id, { status: before }, { status, rejection_reason });
      return json({ ok: true, status });
    }
    if (action === 'pause') {
      if (before !== 'published') return json({ error: 'invalid_status' }, 400);
      if (item) item.status = 'paused';
      listingModeration.set(id, { status: 'paused' });
      audit('Admin', 'listing.pause', 'listing', id, { status: before }, { status: 'paused' });
      return json({ ok: true, status: 'paused' });
    }
    if (action === 'resume') {
      if (before !== 'paused') return json({ error: 'invalid_status' }, 400);
      if (item) item.status = 'published';
      listingModeration.set(id, { status: 'published' });
      audit('Admin', 'listing.resume', 'listing', id, { status: before }, { status: 'published' });
      return json({ ok: true, status: 'published' });
    }
    return json({ error: 'invalid_action' }, 400);
  }
  if (route === 'admin/queue' && method === 'GET') {
    const seedPending = LISTINGS.filter((l) => l.risk_flags && l.risk_flags.length > 0)
      .filter((l) => {
        const mod = listingModeration.get(l.id);
        return !mod || mod.status === 'pending_review';
      })
      .map((l) => ({
        id: l.id, reference_code: l.reference_code, title: l.title_tr, owner: l.landlord.name,
        status: 'pending_review', risk_flags: l.risk_flags, photo: l.photos[0],
        price: l.price, city: l.city, priority: true,
      }));
    const created = userListings
      .filter((u) => (listingModeration.get(u.id)?.status || u.status) === 'pending_review')
      .map((u) => ({ ...u, risk_flags: u.risk_flags || [], priority: false }));
    return json({ items: [...seedPending, ...created] });
  }
  if (path[0] === 'admin' && path[1] === 'listings' && path[2] && method === 'GET') {
    const detail = mockAdminListingDetail(path[2]);
    if (!detail) return json({ error: 'not_found' }, 404);
    return json(detail);
  }
  if (route === 'admin/review' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const action = b.action === 'request_changes' ? 'request_changes' : b.action;
    if (!['approve', 'reject', 'request_changes'].includes(action)) return json({ error: 'invalid' }, 400);
    const reason = (b.reason || '').trim();
    if ((action === 'reject' || action === 'request_changes') && !reason) {
      return json({ error: 'reason_required' }, 400);
    }
    const item = userListings.find((u) => u.id === b.id);
    const before = item ? item.status : (listingModeration.get(b.id)?.status || 'pending_review');
    const status = action === 'approve' ? 'published' : 'rejected';
    const rejection_reason = action === 'approve'
      ? null
      : `${action === 'request_changes' ? 'Lütfen şu bilgileri düzeltip ilanı tekrar incelemeye gönderin:\n' : ''}${reason}`;
    if (item) {
      item.status = status;
      item.rejection_reason = rejection_reason;
    }
    listingModeration.set(b.id, { status, rejection_reason });
    audit('Admin', `listing.${action}`, 'listing', b.id, { status: before }, { status, reason: rejection_reason });
    return json({ ok: true, status, rejection_reason });
  }
  if (route === 'admin/reports' && method === 'GET') return json({ items: reports });
  if (route === 'admin/reports/resolve' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const r = reports.find((x) => x.id === b.id);
    if (r) r.status = 'resolved';
    audit('Admin', 'report.resolve', 'report', b.id, { status: 'open' }, { status: 'resolved', action: b.action || 'unpublish' });
    return json({ ok: true });
  }
  if (route === 'admin/users' && method === 'GET') return json({ items: users });
  if (route === 'admin/users/status' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const u = users.find((x) => x.id === b.id);
    const before = u ? u.status : null;
    if (u) u.status = b.status;
    audit('Admin', 'user.status', 'user', b.id, { status: before }, { status: b.status });
    return json({ ok: true });
  }
  if (route === 'admin/invoices' && method === 'GET') {
    const mockOrders = globalThis.__koShopierOrders || new Map();
    const shopierItems = [...mockOrders.values()].map((o) => ({
      id: o.platform_order_id,
      source: 'shopier',
      user: o.buyer_email || o.user_id || 'Demo',
      user_email: o.buyer_email || null,
      package: `Premium ${String(o.plan_id || '').toUpperCase()}`,
      plan_id: o.plan_id,
      amount: Number(o.amount || 0),
      currency: o.currency || 'TRY',
      status: o.status === 'paid' ? 'paid' : o.status || 'pending',
      platform_order_id: o.platform_order_id,
      shopier_payment_id: o.shopier_payment_id || null,
      listing_ref: null,
      listing_title: null,
      created_at: o.created_at || null,
      paid_at: o.paid_at || null,
    }));
    const bankItems = invoices.map((inv) => ({
      id: inv.id,
      source: 'bank',
      user: inv.user,
      package: inv.package,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status === 'paid' ? 'paid' : 'pending',
      bank_reference: inv.bank_reference,
      platform_order_id: null,
      shopier_payment_id: null,
      listing_ref: null,
      created_at: inv.issued_at,
      paid_at: inv.marked_paid_at || null,
    }));
    return json({
      items: [...shopierItems, ...bankItems],
      summary: {
        shopier_paid: shopierItems.filter((i) => i.status === 'paid').length,
        shopier_pending: shopierItems.filter((i) => i.status === 'pending').length,
        bank_unpaid: bankItems.filter((i) => i.status !== 'paid').length,
      },
    });
  }
  if (route === 'admin/invoices/pay' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const inv = invoices.find((x) => x.id === b.id);
    const before = inv ? inv.status : null;
    if (inv) { inv.status = 'paid'; inv.marked_paid_at = new Date().toISOString(); inv.bank_reference = b.bank_reference || inv.bank_reference; }
    audit('Admin', 'invoice.mark_paid', 'invoice', b.id, { status: before }, { status: 'paid' });
    return json({ ok: true, subscription_activated: true });
  }
  if (route === 'admin/coords' && method === 'GET') {
    return json({
      items: UNIVERSITIES.map((u) => ({
        id: u.id,
        slug: u.slug,
        short: u.short || universityShort(u.slug, u.name_en, u.name_tr),
        name: u.name_tr,
        name_tr: u.name_tr,
        name_en: u.name_en,
        city: u.city,
        coordinates_verified: u.coordinates_verified,
        lat: u.lat,
        lng: u.lng,
        students: u.students,
        is_active: u.is_active !== false,
      })),
    });
  }
  if (route === 'admin/universities' && method === 'GET') {
    return json({
      items: UNIVERSITIES.map((u) => ({
        id: u.id,
        slug: u.slug,
        short: u.short || universityShort(u.slug, u.name_en, u.name_tr),
        name: u.name_tr,
        name_tr: u.name_tr,
        name_en: u.name_en,
        city: u.city,
        coordinates_verified: u.coordinates_verified,
        lat: u.lat,
        lng: u.lng,
        students: u.students,
        is_active: u.is_active !== false,
      })),
    });
  }
  if (route === 'admin/universities' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const nameTr = String(b.name_tr || b.name || '').trim();
    const nameEn = String(b.name_en || nameTr).trim();
    if (nameTr.length < 2) return json({ error: 'name_required' }, 400);
    const city = String(b.city || '').trim();
    if (!city) return json({ error: 'city_required' }, 400);
    let slug = String(b.slug || '').trim() || slugifyUniversityName(nameTr);
    const lat = b.lat != null && b.lat !== '' ? Number(b.lat) : null;
    const lng = b.lng != null && b.lng !== '' ? Number(b.lng) : null;
    const students = b.students != null && b.students !== '' ? Number(b.students) : null;
    const verify = b.coordinates_verified === true || b.coordinates_verified === 'true';
    const isActive = !(b.is_active === false || b.is_active === 'false');

    if (b.id) {
      const u = UNIVERSITIES.find((x) => x.id === b.id);
      if (!u) return json({ error: 'not_found' }, 404);
      Object.assign(u, {
        name_tr: nameTr,
        name_en: nameEn,
        slug,
        short: universityShort(slug, nameEn, nameTr),
        city,
        lat: Number.isFinite(lat) ? lat : u.lat,
        lng: Number.isFinite(lng) ? lng : u.lng,
        students: Number.isFinite(students) ? students : u.students,
        coordinates_verified: verify,
        is_active: isActive,
      });
      audit('Admin', 'university.update', 'university', u.id, null, { slug, city, lat: u.lat, lng: u.lng });
      return json({ ok: true, id: u.id });
    }

    const id = `u-${slug.slice(0, 12)}-${Date.now().toString(36).slice(-4)}`;
    UNIVERSITIES.push({
      id,
      slug,
      short: universityShort(slug, nameEn, nameTr),
      name_tr: nameTr,
      name_en: nameEn,
      city,
      lat: Number.isFinite(lat) ? lat : (CITY_FALLBACK[city]?.lat ?? 35.18),
      lng: Number.isFinite(lng) ? lng : (CITY_FALLBACK[city]?.lng ?? 33.38),
      students: Number.isFinite(students) ? students : 0,
      coordinates_verified: verify && Number.isFinite(lat) && Number.isFinite(lng),
      is_active: isActive,
    });
    audit('Admin', 'university.create', 'university', id, null, { slug, city });
    return json({ ok: true, id });
  }
  if (route === 'admin/universities/delete' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const idx = UNIVERSITIES.findIndex((x) => x.id === b.id);
    if (idx < 0) return json({ error: 'not_found' }, 404);
    if (b.hard === true || b.hard === 'true') {
      const removed = UNIVERSITIES.splice(idx, 1)[0];
      audit('Admin', 'university.delete', 'university', b.id, { slug: removed.slug }, null);
      return json({ ok: true, deleted: true });
    }
    UNIVERSITIES[idx].is_active = false;
    audit('Admin', 'university.deactivate', 'university', b.id, null, { is_active: false });
    return json({ ok: true, deactivated: true });
  }
  if (route === 'admin/coords/verify' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const u = UNIVERSITIES.find((x) => x.id === b.id);
    if (u) {
      if (b.lat != null) u.lat = Number(b.lat);
      if (b.lng != null) u.lng = Number(b.lng);
      u.coordinates_verified = true;
    }
    audit('Admin', 'university.verify_coords', 'university', b.id, { coordinates_verified: false }, { coordinates_verified: true });
    return json({ ok: true });
  }
  if (route === 'admin/audit' && method === 'GET') return json({ items: auditLog.slice(0, 100) });
  if (route === 'admin/health' && method === 'GET') {
    return json({
      items: [
        { check_name: 'smtp_canary', status: 'ok', detail: 'MOCK', checked_at: new Date().toISOString() },
        { check_name: 'fx_rates', status: 'ok', detail: 'MOCK', checked_at: new Date().toISOString() },
        { check_name: 'storage', status: 'ok', detail: 'MOCK', checked_at: new Date().toISOString() },
        { check_name: 'whatsapp_spend', status: waSpendCents >= WA_SPEND_CEILING ? 'fail' : 'ok', detail: `${waSpendCents}/${WA_SPEND_CEILING}`, checked_at: new Date().toISOString() },
      ],
    });
  }

  // ---- mock messaging ----
  if (route === 'messages' && method === 'GET' && !path[1]) {
    const user = await getRequestUser(request);
    const denied = requireUser(user);
    if (denied && !allowMockDemoAuth()) return json(denied, denied.status);
    const uid = user?.id || 'demo-student';
    const items = mockConversations
      .filter((c) => c.student_id === uid || c.landlord_user_id === uid)
      .sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at))
      .map((c) => {
        const isStudent = c.student_id === uid;
        const myRead = isStudent ? c.student_last_read_at : c.landlord_last_read_at;
        const last = mockMessages.filter((m) => m.conversation_id === c.id).slice(-1)[0];
        const unread = last && last.sender_id !== uid && (!myRead || new Date(c.last_message_at) > new Date(myRead));
        return {
          id: c.id,
          reference_code: c.ref,
          listing_title: c.title,
          other_name: isStudent ? c.landlord_name : c.student_name,
          last_message_at: c.last_message_at,
          last_message_preview: c.last_message_preview,
          unread: Boolean(unread),
          role: isStudent ? 'student' : 'landlord',
        };
      });
    return json({ items });
  }
  if (route === 'messages' && method === 'POST' && !path[1]) {
    const user = await getRequestUser(request);
    const denied = requireUser(user);
    if (denied && !allowMockDemoAuth()) return json(denied, denied.status);
    const uid = user?.id || 'demo-student';
    const body = await request.json().catch(() => ({}));
    const text = String(body.body || '').trim();
    if (!body.ref || !text) return json({ error: 'invalid' }, 400);
    const l = getListingByRef(body.ref);
    if (!l) return json({ error: 'not_found' }, 404);
    let conv = mockConversations.find((c) => c.ref === body.ref && c.student_id === uid);
    const now = new Date().toISOString();
    if (!conv) {
      conv = {
        id: `conv-${Date.now()}`,
        listing_id: l.id,
        ref: l.reference_code,
        title: l.title_tr,
        student_id: uid,
        landlord_user_id: `ll-${l.landlord.name}`,
        landlord_name: l.landlord.name,
        student_name: 'Öğrenci',
        last_message_at: now,
        last_message_preview: mockClip(text),
        student_last_read_at: now,
        landlord_last_read_at: null,
      };
      mockConversations.unshift(conv);
    }
    const msg = { id: `msg-${Date.now()}`, conversation_id: conv.id, sender_id: uid, body: text, created_at: now };
    mockMessages.push(msg);
    conv.last_message_at = now;
    conv.last_message_preview = mockClip(text);
    conv.student_last_read_at = now;
    return json({ ok: true, conversation_id: conv.id, message: msg });
  }
  if (path[0] === 'messages' && path[1] === 'unread' && method === 'GET') {
    const user = await getRequestUser(request);
    const denied = requireUser(user);
    if (denied && !allowMockDemoAuth()) return json({ count: 0 });
    const uid = user?.id || 'demo-student';
    let count = 0;
    for (const c of mockConversations) {
      if (c.student_id !== uid && c.landlord_user_id !== uid) continue;
      const isStudent = c.student_id === uid;
      const myRead = isStudent ? c.student_last_read_at : c.landlord_last_read_at;
      const last = mockMessages.filter((m) => m.conversation_id === c.id).slice(-1)[0];
      if (last && last.sender_id !== uid && (!myRead || new Date(c.last_message_at) > new Date(myRead))) count += 1;
    }
    return json({ count });
  }
  if (path[0] === 'messages' && path[1] && path[1] !== 'unread' && method === 'GET') {
    const user = await getRequestUser(request);
    const denied = requireUser(user);
    if (denied && !allowMockDemoAuth()) return json(denied, denied.status);
    const uid = user?.id || 'demo-student';
    const conv = mockConversations.find((c) => c.id === path[1]);
    if (!conv) return json({ error: 'not_found' }, 404);
    if (conv.student_id !== uid && conv.landlord_user_id !== uid) return json({ error: 'forbidden' }, 403);
    const now = new Date().toISOString();
    if (conv.student_id === uid) conv.student_last_read_at = now;
    else conv.landlord_last_read_at = now;
    const isStudent = conv.student_id === uid;
    return json({
      conversation: {
        id: conv.id,
        reference_code: conv.ref,
        listing_title: conv.title,
        other_name: isStudent ? conv.landlord_name : conv.student_name,
        role: isStudent ? 'student' : 'landlord',
      },
      messages: mockMessages
        .filter((m) => m.conversation_id === conv.id)
        .map((m) => ({ id: m.id, body: m.body, created_at: m.created_at, mine: m.sender_id === uid, sender_id: m.sender_id })),
    });
  }
  if (path[0] === 'messages' && path[1] && path[1] !== 'unread' && method === 'POST') {
    const user = await getRequestUser(request);
    const denied = requireUser(user);
    if (denied && !allowMockDemoAuth()) return json(denied, denied.status);
    const uid = user?.id || 'demo-student';
    const conv = mockConversations.find((c) => c.id === path[1]);
    if (!conv) return json({ error: 'not_found' }, 404);
    if (conv.student_id !== uid && conv.landlord_user_id !== uid) return json({ error: 'forbidden' }, 403);
    const body = await request.json().catch(() => ({}));
    const text = String(body.body || '').trim();
    if (!text) return json({ error: 'invalid' }, 400);
    const now = new Date().toISOString();
    const msg = { id: `msg-${Date.now()}`, conversation_id: conv.id, sender_id: uid, body: text, created_at: now };
    mockMessages.push(msg);
    conv.last_message_at = now;
    conv.last_message_preview = mockClip(text);
    if (conv.student_id === uid) conv.student_last_read_at = now;
    else conv.landlord_last_read_at = now;
    return json({ ok: true, message: { id: msg.id, body: text, created_at: now, mine: true, sender_id: uid } });
  }

  return null;
}

async function handleLive(request, route, path, method, sp, user) {
  if (route === 'config' && method === 'GET') return json(await db.dbGetConfig(), 200, 'public, max-age=15, s-maxage=30, stale-while-revalidate=60');

  if (route === 'listings' && method === 'GET') return json(await db.dbListListings(sp), 200, PUBLIC_CACHE);

  if (path[0] === 'listings' && path[1] && method === 'GET') {
    const data = await db.dbGetListingByRef(path[1]);
    if (!data) return json({ error: 'not_found' }, 404);
    return json(data, 200, PUBLIC_CACHE);
  }

  if (route === 'universities' && method === 'GET') return json(await db.dbUniversities(), 200, PUBLIC_CACHE);
  if (path[0] === 'universities' && path[1] && method === 'GET') {
    const data = await db.dbUniversityBySlug(path[1]);
    if (!data) return json({ error: 'not_found' }, 404);
    return json(data, 200, PUBLIC_CACHE);
  }

  if (route === 'reveal' && method === 'POST') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const body = await request.json().catch(() => ({}));
    if (!body.ref) return json({ error: 'invalid' }, 400);
    const result = await db.dbRevealContact(
      user,
      body.ref,
      hashIp(clientIp(request)),
      hashIp(request.headers.get('user-agent') || '')
    );
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }

  if (route === 'reports' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!body.ref || !body.reason) return json({ error: 'invalid' }, 400);
    return json(await db.dbCreateReport(user, body, hashIp(clientIp(request))));
  }

  if (route === 'my/listings' && method === 'GET') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    return json(await db.dbMyListings(user));
  }
  if (path[0] === 'my' && path[1] === 'listings' && path[2] && method === 'GET') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const result = await db.dbGetMyListing(user, path[2]);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (route === 'my/listings' && method === 'POST') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const body = await request.json().catch(() => ({}));
    const result = await db.dbCreateListing(user, body);
    if (result.error) return json({ error: result.error, detail: result.detail || null }, result.status);
    return json(result);
  }
  if (path[0] === 'my' && path[1] === 'listings' && path[2] && method === 'PATCH') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const body = await request.json().catch(() => ({}));
    const result = await db.dbUpdateListing(user, path[2], body);
    if (result.error) return json({ error: result.error, detail: result.detail || null }, result.status);
    return json(result);
  }
  if (path[0] === 'my' && path[1] === 'listings' && path[2] && method === 'DELETE') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const result = await db.dbDeleteListing(user, path[2]);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (path[0] === 'my' && path[1] === 'listings' && path[2] && path[3] === 'action' && method === 'POST') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const body = await request.json().catch(() => ({}));
    const result = await db.dbOwnerListingAction(user, path[2], body.action);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (path[0] === 'my' && path[1] === 'listings' && path[2] && path[3] === 'promote' && method === 'POST') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const body = await request.json().catch(() => ({}));
    const result = await db.dbPromoteListing(user, path[2], body.plan);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (route === 'my/become-landlord' && method === 'POST') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const body = await request.json().catch(() => ({}));
    return json(await db.dbBecomeLandlord(user, body));
  }
  if (route === 'my/profile' && method === 'GET') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    return json({ profile: await db.dbGetMyProfile(user) });
  }
  if (route === 'my/profile' && method === 'POST') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const body = await request.json().catch(() => ({}));
    return json(await db.dbUpdateProfile(user, body));
  }
  if (path[0] === 'my' && path[1] === 'profile' && path[2] === 'avatar' && method === 'POST') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const form = await request.formData().catch(() => null);
    const file = form?.get('file') || form?.get('avatar');
    if (!file || typeof file === 'string' || !file.arrayBuffer) {
      return json({ error: 'invalid' }, 400);
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await db.dbUploadAvatar(user, buf, file.type || 'image/jpeg', file.name || 'avatar.jpg');
    if (result.error) return json({ error: result.error, detail: result.detail || null }, result.status);
    return json(result);
  }
  if (route === 'my/saved' && method === 'GET') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    return json(await db.dbSavedListings(user));
  }
  if (route === 'my/saved' && method === 'POST') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const body = await request.json().catch(() => ({}));
    if (!body.listing_id) return json({ error: 'invalid' }, 400);
    return json(await db.dbToggleSave(user, body.listing_id, body.save !== false));
  }
  if (route === 'my/analytics' && method === 'GET') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    return json(await db.dbMyAnalytics(user));
  }
  if (route === 'my/inquiries' && method === 'GET') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    return json(await db.dbMyInquiries(user));
  }
  if (route === 'my/reports' && method === 'GET') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    return json(await db.dbMyReports(user));
  }
  if (route === 'my/billing' && method === 'GET') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    return json(await db.dbMyBilling(user));
  }

  if (route === 'messages' && method === 'GET' && !path[1]) {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const result = await db.dbListConversations(user);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (route === 'messages' && method === 'POST' && !path[1]) {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const body = await request.json().catch(() => ({}));
    const result = await db.dbStartConversation(user, body);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (path[0] === 'messages' && path[1] === 'unread' && method === 'GET') {
    const denied = requireUser(user);
    if (denied) return json({ count: 0 });
    return json(await db.dbUnreadMessageCount(user));
  }
  if (path[0] === 'messages' && path[1] && path[1] !== 'unread' && method === 'GET') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const result = await db.dbGetConversation(user, path[1]);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (path[0] === 'messages' && path[1] && path[1] !== 'unread' && method === 'POST') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const body = await request.json().catch(() => ({}));
    const result = await db.dbSendMessage(user, path[1], body.body);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }

  if (route.startsWith('admin/')) {
    const denied = requireAdmin(user);
    if (denied) return json(denied, denied.status);
  }

  if (route === 'admin/queue' && method === 'GET') return json(await db.dbAdminQueue());
  if (route === 'admin/listings' && method === 'GET') {
    const url = new URL(request.url);
    const result = await db.dbAdminListings({
      status: url.searchParams.get('status') || 'all',
      q: url.searchParams.get('q') || '',
      limit: url.searchParams.get('limit') || 80,
      offset: url.searchParams.get('offset') || 0,
    });
    return json(result);
  }
  if (route === 'admin/listings/action' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const result = await db.dbAdminListingAction(user, body);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (path[0] === 'admin' && path[1] === 'listings' && path[2] && method === 'GET') {
    const result = await db.dbAdminListingDetail(path[2]);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (route === 'admin/review' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const result = await db.dbAdminReview(user, body);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (route === 'admin/reports' && method === 'GET') return json(await db.dbAdminReports());
  if (route === 'admin/reports/resolve' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const result = await db.dbAdminResolveReport(user, body);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (route === 'admin/users' && method === 'GET') return json(await db.dbAdminUsers());
  if (route === 'admin/users/status' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const result = await db.dbAdminSetUserStatus(user, body);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (route === 'admin/landlords/verify' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const result = await db.dbAdminSetLandlordVerification(user, body);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (route === 'admin/invoices' && method === 'GET') {
    const result = await db.dbAdminPayments();
    return json(result);
  }
  if (route === 'admin/invoices/pay' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    const admin = supabaseAdmin();
    const { data: inv } = await admin.from('invoices').select('*').eq('id', body.id).maybeSingle();
    if (!inv) return json({ error: 'not_found' }, 404);
    await admin.from('invoices').update({
      status: 'paid',
      marked_paid_at: new Date().toISOString(),
      marked_paid_by: user.id,
      bank_reference: body.bank_reference || inv.bank_reference,
    }).eq('id', body.id);
    const { data: pkg } = await admin.from('packages').select('*').eq('is_active', true).order('listing_quota', { ascending: false }).limit(1).maybeSingle();
    if (pkg) {
      const ends = new Date(Date.now() + (pkg.duration_days || 30) * 86400000).toISOString();
      const { data: existingSub } = await admin.from('subscriptions').select('id').eq('user_id', inv.user_id).eq('status', 'active').maybeSingle();
      if (existingSub) {
        await admin.from('subscriptions').update({ ends_at: ends, package_id: pkg.id }).eq('id', existingSub.id);
      } else {
        const { data: newSub } = await admin.from('subscriptions').insert({
          user_id: inv.user_id, package_id: pkg.id, starts_at: new Date().toISOString(), ends_at: ends, status: 'active',
        }).select('id').single();
        if (newSub) await admin.from('invoices').update({ subscription_id: newSub.id }).eq('id', inv.id);
      }
    }
    await admin.from('audit_log').insert({
      actor_user_id: user.id, action: 'invoice.mark_paid', entity_type: 'invoice', entity_id: body.id,
      after_snapshot: { status: 'paid', subscription_activated: true },
    });
    return json({ ok: true, subscription_activated: true });
  }
  if (route === 'admin/coords' && method === 'GET') return json(await db.dbAdminCoords());
  if (route === 'admin/universities' && method === 'GET') return json(await db.dbAdminUniversities());
  if (route === 'admin/universities' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const out = await db.dbAdminUniversitySave(user, body);
    if (out?.error) return json(out, out.status || 400);
    return json(out);
  }
  if (route === 'admin/universities/delete' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const out = await db.dbAdminUniversityDelete(user, body);
    if (out?.error) return json(out, out.status || 400);
    return json(out);
  }
  if (route === 'admin/coords/verify' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const out = await db.dbAdminUniversityVerify(user, body);
    if (out?.error) return json(out, out.status || 400);
    return json(out);
  }
  if (route === 'admin/audit' && method === 'GET') return json(await db.dbAdminAudit());
  if (route === 'admin/health' && method === 'GET') return json(await db.dbAdminHealth());

  return null;
}

async function handle(request, { path = [] } = {}) {
  const route = path.join('/');
  const url = new URL(request.url);
  const sp = url.searchParams;
  const method = request.method;

  try {
    // WhatsApp webhook (always live HMAC — never mock-bypass signature)
    if (route === 'whatsapp/webhook' && method === 'GET') {
      const mode = sp.get('hub.mode');
      const token = sp.get('hub.verify_token');
      const challenge = sp.get('hub.challenge');
      if (mode === 'subscribe' && token && token === (process.env.WHATSAPP_VERIFY_TOKEN || '')) {
        return new NextResponse(challenge || '', { status: 200 });
      }
      return json({ error: 'forbidden' }, 403);
    }
    if (route === 'whatsapp/webhook' && method === 'POST') {
      const raw = await request.text();
      const sig = request.headers.get('x-hub-signature-256');
      const secret = process.env.WHATSAPP_APP_SECRET || '';
      if (!verifyHmac(raw, sig, secret)) return json({ error: 'invalid_signature' }, 403);
      let payload;
      try { payload = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
      const msgId = payload?.wa_message_id || payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
      const from = payload?.from || payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
      const text = (payload?.text || payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || '').trim();
      if (from && OPTOUT_WORDS.includes(text.toLowerCase())) { waOptOut.add(from); return json({ ok: true, opted_out: true }); }
      if (from && waOptOut.has(from)) return json({ ok: true, suppressed: true });
      if (msgId) { if (waProcessed.has(msgId)) return json({ ok: true, duplicate: true }); waProcessed.add(msgId); }
      return json({ ok: true, processed_message_id: msgId || null });
    }

    // Demo simulator — disabled in production
    if (route === 'whatsapp/sim' && method === 'POST') {
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_WHATSAPP_SIM !== 'true') {
        return json({ error: 'not_found' }, 404);
      }
      const b = await request.json().catch(() => ({}));
      const msg = (b.message || '').toLowerCase();
      if (b.flow === 'landlord') {
        const price = (msg.match(/\d{2,6}/) || ['6000'])[0];
        return json({
          reply_type: 'summary',
          extracted: {
            property_type: msg.includes('stüdyo') || msg.includes('studio') ? 'studio' : (msg.includes('oda') ? 'room' : 'apartment'),
            bedrooms: (msg.match(/(\d)\+1/) || [null, '2'])[1], price_amount: price,
            price_currency: msg.includes('£') || msg.includes('gbp') ? 'GBP' : (msg.includes('$') ? 'USD' : 'TRY'),
            neighbourhood: msg.includes('girne') ? 'Girne' : (msg.includes('mağusa') || msg.includes('magusa') ? 'Gazimağusa' : 'Lefkoşa'),
            furnished: !msg.includes('eşyasız'),
          },
          note: 'Bilgileri onaylıyor musunuz? Onaylarsanız ilan admin incelemesine (pending_review) düşer.',
        });
      }
      let items = LISTINGS.slice();
      if (msg.includes('girne')) items = items.filter((l) => l.city === 'Girne');
      const cards = items.slice(0, 5).map((l) => ({
        ref: l.reference_code, title: l.title_tr, price: l.price,
        walking_minutes: walkMinutes(l.distance_m), city: l.city, photo: l.photos[0], verified: l.landlord.verified,
      }));
      return json({ reply_type: 'cards', cards });
    }

    const user = await getRequestUser(request);

    if (isMockMode()) {
      const mockRes = await handleMock(request, route, path, method, sp);
      if (mockRes) return mockRes;
    } else {
      const liveRes = await handleLive(request, route, path, method, sp, user);
      if (liveRes) return liveRes;
    }

    return json({ error: 'not_found', route }, 404);
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', route, err: String(e?.message || e) }));
    return json({ error: 'server_error' }, 500);
  }
}

export async function GET(request, ctx) {
  const params = await ctx.params;
  return handle(request, { path: params?.path || [] });
}
export async function POST(request, ctx) {
  const params = await ctx.params;
  return handle(request, { path: params?.path || [] });
}
export async function PATCH(request, ctx) {
  const params = await ctx.params;
  return handle(request, { path: params?.path || [] });
}
export async function DELETE(request, ctx) {
  const params = await ctx.params;
  return handle(request, { path: params?.path || [] });
}
