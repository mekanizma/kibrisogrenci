import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  LISTINGS, UNIVERSITIES, PACKAGES, PRICE_INDEX, FX_TO_GBP, CURRENCIES,
  toGbp, findIndex, publicListing, getListingByRef, HERO_IMAGE,
} from '@/lib/seed';
import { getRequestUser, requireUser, requireAdmin, isMockMode, hashIp } from '@/lib/auth';
import * as db from '@/lib/db';

const json = (data, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

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
  const amen = (g('amenities') || '').split(',').filter(Boolean);
  if (amen.length) items = items.filter((l) => amen.every((a) => l.amenities.includes(a)));
  if (g('price_min')) items = items.filter((l) => l.price_gbp >= Number(g('price_min')));
  if (g('price_max')) items = items.filter((l) => l.price_gbp <= Number(g('price_max')));
  if (g('featured') === '1') items = items.filter((l) => l.featured);
  const sort = g('sort') || 'new';
  if (sort === 'price_asc') items.sort((a, b) => a.price_gbp - b.price_gbp);
  else if (sort === 'price_desc') items.sort((a, b) => b.price_gbp - a.price_gbp);
  else if (sort === 'distance') items.sort((a, b) => a.distance_m - b.distance_m);
  else items.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
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
    const publicUnis = UNIVERSITIES.filter((u) => u.coordinates_verified);
    return json({
      fx_to_gbp: FX_TO_GBP, currencies: CURRENCIES, hero_image: HERO_IMAGE,
      universities: publicUnis.map((u) => ({ ...u, listings_count: LISTINGS.filter((l) => l.uni === u.id).length })),
      all_universities: UNIVERSITIES, packages: PACKAGES,
      stats: {
        listings: LISTINGS.length, universities: publicUnis.length,
        verified_landlords: [...new Set(LISTINGS.filter((l) => l.landlord.verified).map((l) => l.landlord.name))].length,
        cities: [...new Set(LISTINGS.map((l) => l.city))].length,
      },
      cities: [...new Set(LISTINGS.map((l) => l.city))],
      mock: true,
    });
  }

  if (route === 'listings' && method === 'GET') {
    const items = filterListings(sp);
    const limit = Number(sp.get('limit') || 0);
    const out = (limit ? items.slice(0, limit) : items).map((l) => ({ ...publicListing(l), price_index: priceIndexInfo(l) }));
    return json({ total: items.length, items: out });
  }

  if (path[0] === 'listings' && path[1] && method === 'GET') {
    const l = getListingByRef(path[1]);
    if (!l) return json({ error: 'not_found' }, 404);
    const uni = UNIVERSITIES.find((u) => u.id === l.uni);
    const similar = LISTINGS.filter((s) => s.id !== l.id && s.uni === l.uni).slice(0, 3)
      .map((s) => ({ ...publicListing(s), price_index: priceIndexInfo(s) }));
    return json({
      ...publicListing(l),
      university: uni ? { id: uni.id, slug: uni.slug, name_tr: uni.name_tr, name_en: uni.name_en, short: uni.short, city: uni.city } : null,
      price_index: priceIndexInfo(l), similar,
    });
  }

  if (route === 'universities' && method === 'GET') {
    return json({ items: UNIVERSITIES.map((u) => ({ ...u, listings_count: LISTINGS.filter((l) => l.uni === u.id).length })) });
  }
  if (path[0] === 'universities' && path[1] && method === 'GET') {
    const uni = UNIVERSITIES.find((u) => u.slug === path[1]);
    if (!uni) return json({ error: 'not_found' }, 404);
    const listings = LISTINGS.filter((l) => l.uni === uni.id).map((l) => ({ ...publicListing(l), price_index: priceIndexInfo(l) }));
    return json({ university: uni, listings_count: listings.length, listings, price_index: PRICE_INDEX.filter((p) => p.university_id === uni.id) });
  }

  // Reveal in mock still requires a real Bearer token when Supabase is configured;
  // otherwise rejects spoofed studentId in production-like runs.
  if (route === 'reveal' && method === 'POST') {
    const user = await getRequestUser(request);
    const denied = requireUser(user);
    if (denied) {
      // Dev-only fallback: only if MOCK_ALLOW_DEMO_AUTH=true
      if (process.env.MOCK_ALLOW_DEMO_AUTH !== 'true') return json(denied, denied.status);
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

  // Landlord / admin mock routes require Bearer admin OR MOCK_ALLOW_DEMO_AUTH
  if (route.startsWith('my/') || route.startsWith('admin/')) {
    const user = await getRequestUser(request);
    const needsAdmin = route.startsWith('admin/');
    if (process.env.MOCK_ALLOW_DEMO_AUTH !== 'true') {
      const gate = needsAdmin ? requireAdmin(user) : requireUser(user);
      if (gate) return json(gate, gate.status);
    }
  }

  if (route === 'my/listings' && method === 'GET') {
    const owner = sp.get('owner') || 'Ayşe Yılmaz';
    const mine = LISTINGS.filter((l) => l.landlord.name === owner)
      .map((l) => ({
        id: l.id, reference_code: l.reference_code, title: l.title_tr, status: 'published',
        price: l.price, city: l.city, view_count: l.view_count, contact_reveal_count: l.contact_reveal_count,
        photo: l.photos[0], price_index: priceIndexInfo(l),
      }))
      .concat(userListings.filter((u) => u.owner === owner));
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
  if (route === 'my/analytics' && method === 'GET') {
    const weeks = ['-5w', '-4w', '-3w', '-2w', '-1w', 'now'];
    return json({ trend: weeks.map((w, i) => ({ week: w, views: 20 + i * 12 + (i % 2) * 6, reveals: 2 + i, saves: 1 + (i % 3), inquiries: (i % 2) })) });
  }
  if (route === 'my/inquiries' && method === 'GET') {
    return json({ items: [] });
  }
  if (route === 'my/billing' && method === 'GET') {
    const owner = sp.get('owner') || 'Ayşe Yılmaz';
    return json({
      subscription: { package: 'Pro', status: 'active', listings_used: 2, listings_total: 15, ends_at: new Date(Date.now() + 60 * 86400000).toISOString() },
      invoices: invoices.filter((i) => i.user === owner),
      bank_instructions: { bank: 'Kıbrıs Vakıflar Bankası', iban: process.env.BANK_IBAN || 'TR00 0000 0000 0000 0000 0000 00', reference: 'KO-PRO-AYSE-01' },
    });
  }
  if (route === 'my/saved' && method === 'GET') return json({ items: [] });

  if (route === 'admin/queue' && method === 'GET') {
    const seedPending = LISTINGS.filter((l) => l.risk_flags && l.risk_flags.length > 0)
      .map((l) => ({
        id: l.id, reference_code: l.reference_code, title: l.title_tr, owner: l.landlord.name,
        status: 'pending_review', risk_flags: l.risk_flags, photo: l.photos[0],
        price: l.price, priority: true,
      }));
    const created = userListings.filter((u) => u.status === 'pending_review').map((u) => ({ ...u, risk_flags: [], priority: false }));
    return json({ items: [...seedPending, ...created] });
  }
  if (route === 'admin/review' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const item = userListings.find((u) => u.id === b.id);
    const before = item ? item.status : 'pending_review';
    if (item) item.status = b.action === 'approve' ? 'published' : 'rejected';
    audit('Admin', `listing.${b.action}`, 'listing', b.id, { status: before }, { status: b.action === 'approve' ? 'published' : 'rejected', reason: b.reason || null });
    return json({ ok: true });
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
  if (route === 'admin/invoices' && method === 'GET') return json({ items: invoices });
  if (route === 'admin/invoices/pay' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const inv = invoices.find((x) => x.id === b.id);
    const before = inv ? inv.status : null;
    if (inv) { inv.status = 'paid'; inv.marked_paid_at = new Date().toISOString(); inv.bank_reference = b.bank_reference || inv.bank_reference; }
    audit('Admin', 'invoice.mark_paid', 'invoice', b.id, { status: before }, { status: 'paid' });
    return json({ ok: true, subscription_activated: true });
  }
  if (route === 'admin/coords' && method === 'GET') {
    return json({ items: UNIVERSITIES.map((u) => ({ id: u.id, short: u.short, name: u.name_tr, city: u.city, coordinates_verified: u.coordinates_verified, lat: u.lat, lng: u.lng })) });
  }
  if (route === 'admin/coords/verify' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const u = UNIVERSITIES.find((x) => x.id === b.id);
    if (u) u.coordinates_verified = true;
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

  return null;
}

async function handleLive(request, route, path, method, sp, user) {
  if (route === 'config' && method === 'GET') return json(await db.dbGetConfig());

  if (route === 'listings' && method === 'GET') return json(await db.dbListListings(sp));

  if (path[0] === 'listings' && path[1] && method === 'GET') {
    const data = await db.dbGetListingByRef(path[1]);
    if (!data) return json({ error: 'not_found' }, 404);
    return json(data);
  }

  if (route === 'universities' && method === 'GET') return json(await db.dbUniversities());
  if (path[0] === 'universities' && path[1] && method === 'GET') {
    const data = await db.dbUniversityBySlug(path[1]);
    if (!data) return json({ error: 'not_found' }, 404);
    return json(data);
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
  if (route === 'my/become-landlord' && method === 'POST') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    const body = await request.json().catch(() => ({}));
    return json(await db.dbBecomeLandlord(user, body));
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
  if (route === 'my/billing' && method === 'GET') {
    const denied = requireUser(user);
    if (denied) return json(denied, denied.status);
    return json(await db.dbMyBilling(user));
  }

  if (route.startsWith('admin/')) {
    const denied = requireAdmin(user);
    if (denied) return json(denied, denied.status);
  }

  if (route === 'admin/queue' && method === 'GET') return json(await db.dbAdminQueue());
  if (route === 'admin/review' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const result = await db.dbAdminReview(user, body);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (route === 'admin/reports' && method === 'GET') return json(await db.dbAdminReports());
  if (route === 'admin/reports/resolve' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    const admin = supabaseAdmin();
    await admin.from('reports').update({ status: 'resolved', resolved_by: user.id }).eq('id', body.id);
    if (body.action === 'unpublish' && body.listing_id) {
      await admin.from('listings').update({ status: 'rejected' }).eq('id', body.listing_id);
    }
    await admin.from('audit_log').insert({
      actor_user_id: user.id, action: 'report.resolve', entity_type: 'report', entity_id: body.id,
      after_snapshot: { status: 'resolved', action: body.action || null },
    });
    return json({ ok: true });
  }
  if (route === 'admin/users' && method === 'GET') return json(await db.dbAdminUsers());
  if (route === 'admin/users/status' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const result = await db.dbAdminSetUserStatus(user, body);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }
  if (route === 'admin/invoices' && method === 'GET') {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    const { data } = await supabaseAdmin().from('invoices').select('id, user_id, amount, currency, status, bank_reference, issued_at, profiles(full_name)').order('issued_at', { ascending: false }).limit(100);
    return json({
      items: (data || []).map((inv) => ({
        id: inv.id,
        user: inv.profiles?.full_name || inv.user_id?.slice(0, 8),
        package: inv.bank_reference || 'Paket',
        amount: Number(inv.amount),
        currency: inv.currency,
        status: inv.status,
        bank_reference: inv.bank_reference,
      })),
    });
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
  if (route === 'admin/coords/verify' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    await supabaseAdmin().from('universities').update({ coordinates_verified: true }).eq('id', body.id);
    return json({ ok: true });
  }
  if (route === 'admin/audit' && method === 'GET') return json(await db.dbAdminAudit());
  if (route === 'admin/health' && method === 'GET') return json(await db.dbAdminHealth());

  return null;
}

async function handle(request, ctx) {
  const params = await ctx.params;
  const path = params?.path || [];
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

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
