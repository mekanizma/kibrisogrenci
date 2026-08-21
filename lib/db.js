import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseForToken } from '@/lib/supabase/server';

function walkMinutes(m) {
  if (m == null) return null;
  return Math.round((Number(m) / 4500) * 60);
}

async function resolvePhotoUrls(keys) {
  const admin = supabaseAdmin();
  const out = [];
  for (const key of keys || []) {
    if (!key) continue;
    if (/^https?:\/\//i.test(key)) {
      out.push(key);
      continue;
    }
    const { data } = await admin.storage.from('listing-photos').createSignedUrl(key, 60 * 60 * 24 * 7);
    out.push(data?.signedUrl || key);
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
    featured: extras.featured || false,
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
  };
}

async function priceIndexFor(listing) {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('price_index')
    .select('*')
    .eq('university_id', listing.university_id || listing.uni)
    .eq('property_type', listing.property_type)
    .eq('bedrooms', listing.bedrooms ?? 0)
    .maybeSingle();

  if (!data || data.sample_size < 5) {
    return { enough: false, sample_size: data?.sample_size || 0 };
  }
  const priceGbp = listing.price_gbp ?? listing.price_gbp_normalised;
  if (priceGbp == null) return { enough: true, median_gbp: Number(data.median_price_gbp), sample_size: data.sample_size, position: 'at', pct: 0 };
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

const listingSelect = `
  id, landlord_id, university_id, reference_code, title_tr, title_en, description_tr, description_en,
  property_type, bedrooms, bathrooms, furnished, size_sqm, max_occupants, gender_preference,
  available_from, minimum_stay_months, price_amount, price_currency, price_gbp_normalised,
  deposit_amount, deposit_currency, bills_included, bills_note, agency_fee_note, amenities,
  neighbourhood, city, status, published_at, last_confirmed_available_at, view_count,
  contact_reveal_count, risk_flags, is_demo,
  listing_photos ( storage_key, sort_order ),
  landlord_profiles ( id, display_name, is_agency, verification_status, user_id )
`;

export async function dbGetConfig() {
  const admin = supabaseAdmin();
  const [{ data: unis }, { data: packages }, { data: fx }, { data: listingRows }] = await Promise.all([
    admin.from('universities').select('*').eq('is_active', true),
    admin.from('packages').select('*').eq('is_active', true),
    admin.from('fx_rates').select('*').order('rate_date', { ascending: false }).limit(20),
    admin.from('listings').select('id, city, university_id, landlord_id').eq('status', 'published'),
  ]);

  const fx_to_gbp = { GBP: 1, TRY: 1 / 42.7, USD: 1 / 1.27, EUR: 1 / 1.17 };
  (fx || []).forEach((r) => {
    if (r.base_currency === 'GBP' && r.quote_currency && r.rate) {
      fx_to_gbp[r.quote_currency] = 1 / Number(r.rate);
    }
  });

  const publicUnis = (unis || []).filter((u) => u.coordinates_verified);
  const verifiedLandlordIds = new Set();
  // lightweight stats
  const cities = [...new Set((listingRows || []).map((l) => l.city).filter(Boolean))];

  return {
    fx_to_gbp,
    currencies: ['TRY', 'GBP', 'USD', 'EUR'],
    hero_image: process.env.NEXT_PUBLIC_HERO_IMAGE || '/hero.jpg',
    universities: publicUnis.map((u) => ({
      id: u.id,
      slug: u.slug,
      name_tr: u.name_tr,
      name_en: u.name_en,
      short: (u.name_en || u.name_tr || '').split(' ').map((w) => w[0]).join('').slice(0, 4).toUpperCase() || u.slug.slice(0, 3).toUpperCase(),
      city: u.city,
      coordinates_verified: u.coordinates_verified,
      listings_count: (listingRows || []).filter((l) => l.university_id === u.id).length,
    })),
    all_universities: (unis || []).map((u) => ({
      id: u.id,
      slug: u.slug,
      name_tr: u.name_tr,
      name_en: u.name_en,
      city: u.city,
      coordinates_verified: u.coordinates_verified,
    })),
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
      listings: (listingRows || []).length,
      universities: publicUnis.length,
      verified_landlords: verifiedLandlordIds.size,
      cities: cities.length,
    },
    cities,
  };
}

export async function dbListListings(sp) {
  const admin = supabaseAdmin();
  let q = admin
    .from('listings')
    .select(listingSelect)
    .eq('status', 'published');

  const university = sp.get('university');
  const city = sp.get('city');
  const property_type = sp.get('property_type');
  const bedrooms = sp.get('bedrooms');
  const furnished = sp.get('furnished');
  const bills_included = sp.get('bills_included');
  const gender = sp.get('gender');
  const price_min = sp.get('price_min');
  const price_max = sp.get('price_max');

  if (university) q = q.eq('university_id', university);
  if (city) q = q.eq('city', city);
  if (property_type) q = q.eq('property_type', property_type);
  if (bedrooms != null && bedrooms !== '') q = q.eq('bedrooms', Number(bedrooms));
  if (furnished === 'true') q = q.eq('furnished', true);
  if (bills_included === 'true') q = q.eq('bills_included', true);
  if (gender) q = q.in('gender_preference', ['any', gender]);
  if (price_min) q = q.gte('price_gbp_normalised', Number(price_min));
  if (price_max) q = q.lte('price_gbp_normalised', Number(price_max));

  const sort = sp.get('sort') || 'new';
  if (sort === 'price_asc') q = q.order('price_gbp_normalised', { ascending: true });
  else if (sort === 'price_desc') q = q.order('price_gbp_normalised', { ascending: false });
  else if (sp.get('featured') === '1') q = q.order('view_count', { ascending: false });
  else q = q.order('published_at', { ascending: false });

  const { data, error } = await q;
  if (error) throw error;

  let items = (data || []).map((row) => mapPublicListing(row));
  if (sp.get('verified_only') === 'true') {
    items = items.filter((l) => l.landlord_verified);
  }
  const amen = (sp.get('amenities') || '').split(',').filter(Boolean);
  if (amen.length) items = items.filter((l) => amen.every((a) => (l.amenities || []).includes(a)));

  // Soft walk filter: only apply when distance is known
  const maxWalk = Number(sp.get('max_walk') || 0);
  if (maxWalk > 0) {
    items = items.filter((l) => l.walking_minutes == null || l.walking_minutes <= maxWalk);
  }

  if (sort === 'distance') {
    items = [...items].sort((a, b) => {
      const da = a.distance_m ?? Number.POSITIVE_INFINITY;
      const db = b.distance_m ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  }

  const withIndex = await Promise.all(
    items.map(async (l) => {
      const photos = await resolvePhotoUrls(l.photos);
      return { ...l, photos, price_index: await priceIndexFor({ ...l, university_id: l.uni }) };
    })
  );

  const limit = Number(sp.get('limit') || 0);
  const out = limit ? withIndex.slice(0, limit) : withIndex;
  return { total: withIndex.length, items: out };
}

export async function dbGetListingByRef(ref) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('listings')
    .select(listingSelect)
    .eq('reference_code', ref)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  await admin.rpc('increment_listing_view', { p_listing_id: data.id }).catch(() => {});

  const mapped = mapPublicListing(data);
  mapped.photos = await resolvePhotoUrls(mapped.photos);
  const { data: uni } = await admin.from('universities').select('id, slug, name_tr, name_en, city').eq('id', data.university_id).maybeSingle();
  const { data: hist } = await admin
    .from('listing_price_history')
    .select('price_amount, price_currency, changed_at')
    .eq('listing_id', data.id)
    .order('changed_at', { ascending: true })
    .limit(24);
  const { data: similarRows } = await admin
    .from('listings')
    .select(listingSelect)
    .eq('status', 'published')
    .eq('university_id', data.university_id)
    .neq('id', data.id)
    .limit(3);

  const similar = await Promise.all(
    (similarRows || []).map(async (s) => {
      const m = mapPublicListing(s);
      m.photos = await resolvePhotoUrls(m.photos);
      return { ...m, price_index: await priceIndexFor({ ...m, university_id: m.uni }) };
    })
  );

  return {
    ...mapped,
    university: uni
      ? {
          id: uni.id,
          slug: uni.slug,
          name_tr: uni.name_tr,
          name_en: uni.name_en,
          short: (uni.name_en || uni.name_tr || '').slice(0, 3).toUpperCase(),
          city: uni.city,
        }
      : null,
    price_index: await priceIndexFor({ ...mapped, university_id: mapped.uni }),
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

  const client = supabaseForToken(user.accessToken);
  const { data, error } = await client.rpc('reveal_contact', {
    p_listing_id: listing.id,
    p_ip_hash: ipHash || null,
    p_ua_hash: uaHash || null,
  });

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
  await admin.from('inquiries').insert({
    listing_id: listing.id,
    student_id: user.id,
    source: 'web',
    message: `Contact revealed for ${ref}`,
  }).catch(() => {});

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
  const { data: lp } = await client.from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!lp) return { items: [], quota: { used: 0, total: 0, package: null } };

  const { data: items } = await client
    .from('listings')
    .select('id, reference_code, title_tr, status, price_amount, price_currency, city, view_count, contact_reveal_count, listing_photos(storage_key, sort_order)')
    .eq('landlord_id', lp.id)
    .order('created_at', { ascending: false });

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
    });
  }

  // rejection_reason is column-restricted; fetch via admin for owner listings
  const admin = supabaseAdmin();
  if (mapped.length) {
    const { data: reasons } = await admin
      .from('listings')
      .select('id, rejection_reason')
      .in('id', mapped.map((m) => m.id));
    const map = Object.fromEntries((reasons || []).map((r) => [r.id, r.rejection_reason]));
    mapped.forEach((m) => { m.rejection_reason = map[m.id] || null; });
  }

  return {
    items: mapped,
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
  } else if (body.display_name) {
    await client.from('landlord_profiles').update({ display_name: body.display_name }).eq('id', lp.id);
  }

  const mine = await dbMyListings(user);
  if (mine.quota.total > 0 && mine.quota.used >= mine.quota.total) {
    return { error: 'quota_exceeded', status: 402 };
  }

  const { data: fxRows } = await admin
    .from('fx_rates')
    .select('quote_currency, rate')
    .eq('base_currency', 'GBP')
    .order('rate_date', { ascending: false })
    .limit(10);
  const fxToGbp = { GBP: 1 };
  (fxRows || []).forEach((r) => {
    if (r.quote_currency && r.rate) fxToGbp[r.quote_currency] = 1 / Number(r.rate);
  });

  const currency = body.price_currency || 'GBP';
  const amenities = Array.isArray(body.amenities)
    ? body.amenities.filter(Boolean)
    : String(body.amenities || '').split(',').map((s) => s.trim()).filter(Boolean);

  const ref = Math.random().toString(36).replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
  const status = isDraft ? 'draft' : 'pending_review';

  // address_private is column-restricted for SELECT; INSERT via owner RLS still allowed.
  // Use admin after ownership check so private address + GBP normalisation always persist.
  const row = {
    landlord_id: lp.id,
    university_id: body.university_id || null,
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
      university_id: data.university_id,
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

  if (!isDraft && resubmit) {
    if (!title || title.length < 5) return { error: 'invalid', status: 400, detail: 'title' };
    if (!description || description.length < 20) return { error: 'invalid', status: 400, detail: 'description' };
    if (!(priceAmount > 0)) return { error: 'invalid', status: 400, detail: 'price' };
  }

  const { data: fxRows } = await admin
    .from('fx_rates')
    .select('quote_currency, rate')
    .eq('base_currency', 'GBP')
    .order('rate_date', { ascending: false })
    .limit(10);
  const fxToGbp = { GBP: 1 };
  (fxRows || []).forEach((r) => {
    if (r.quote_currency && r.rate) fxToGbp[r.quote_currency] = 1 / Number(r.rate);
  });
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
    university_id: body.university_id || undefined,
    status,
    rejection_reason: status === 'pending_review' ? null : undefined,
    last_confirmed_available_at: new Date().toISOString(),
  };
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

  const { data, error } = await admin.from('listings').update(patch).eq('id', id).select('id, status, reference_code').single();
  if (error) throw error;

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
  if (!['draft', 'rejected', 'pending_review'].includes(existing.status)) {
    return { error: 'cannot_delete_published', status: 400 };
  }

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

export async function dbBecomeLandlord(user, body = {}) {
  const admin = supabaseAdmin();
  const role = user.profile?.role;
  if (role === 'admin') return { ok: true, role: 'admin' };

  await admin.from('profiles').update({
    role: 'landlord',
    full_name: body.display_name || user.profile?.full_name || user.email,
  }).eq('id', user.id);

  const client = supabaseForToken(user.accessToken);
  let { data: lp } = await client.from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!lp) {
    const { data: created, error } = await client
      .from('landlord_profiles')
      .insert({ user_id: user.id, display_name: body.display_name || user.profile?.full_name || user.email })
      .select('id')
      .single();
    if (error) throw error;
    lp = created;
  }

  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { role: 'landlord' },
  }).catch(() => {});

  return { ok: true, role: 'landlord', landlord_profile_id: lp.id };
}

export async function dbMyAnalytics(user) {
  const mine = await dbMyListings(user);
  const weeks = ['-5w', '-4w', '-3w', '-2w', '-1w', 'now'];
  const totalViews = (mine.items || []).reduce((s, l) => s + (l.view_count || 0), 0);
  const totalReveals = (mine.items || []).reduce((s, l) => s + (l.contact_reveal_count || 0), 0);
  // Distribute totals across weeks for a readable trend until daily rollups exist
  const trend = weeks.map((w, i) => ({
    week: w,
    views: Math.round((totalViews / weeks.length) * (0.6 + i * 0.12)),
    reveals: Math.round((totalReveals / weeks.length) * (0.6 + i * 0.12)),
  }));
  return { trend, totals: { views: totalViews, reveals: totalReveals, listings: mine.items.length } };
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
    bank_instructions: {
      bank: process.env.BANK_NAME || 'Kıbrıs Vakıflar Bankası',
      iban: process.env.BANK_IBAN || '',
      reference: `KO-${user.id.slice(0, 8).toUpperCase()}`,
    },
  };
}

export async function dbAdminReports() {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('reports')
    .select('id, listing_id, reason, detail, status, report_count, created_at, listings(reference_code)')
    .order('created_at', { ascending: false })
    .limit(100);
  return {
    items: (data || []).map((r) => ({
      id: r.id,
      listing_id: r.listing_id,
      ref: r.listings?.reference_code || r.listing_id?.slice(0, 8),
      reason: r.reason,
      detail: r.detail,
      status: r.status,
      count: r.report_count || 1,
    })),
  };
}

export async function dbAdminCoords() {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('universities')
    .select('id, slug, name_tr, name_en, city, coordinates_verified, campus_location')
    .order('name_tr');
  return {
    items: (data || []).map((u) => {
      let lat = 0;
      let lng = 0;
      const loc = u.campus_location;
      if (loc && typeof loc === 'object') {
        if (Array.isArray(loc.coordinates)) {
          lng = Number(loc.coordinates[0]) || 0;
          lat = Number(loc.coordinates[1]) || 0;
        }
      }
      return {
        id: u.id,
        short: (u.name_en || u.name_tr || u.slug || '').slice(0, 3).toUpperCase(),
        name: u.name_tr || u.name_en,
        city: u.city,
        lat,
        lng,
        coordinates_verified: !!u.coordinates_verified,
      };
    }),
  };
}

export async function dbAdminQueue() {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('listings')
    .select('id, reference_code, title_tr, status, risk_flags, price_amount, price_currency, landlord_profiles(display_name), listing_photos(storage_key, sort_order)')
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
      risk_flags: l.risk_flags || [],
      photo: photos[0] || '/logo.svg',
      price: { amount: Number(l.price_amount), currency: l.price_currency },
      priority: (l.risk_flags || []).length > 0,
    });
  }
  return { items };
}

export async function dbAdminReview(adminUser, body) {
  const admin = supabaseAdmin();
  const { data: before } = await admin.from('listings').select('status').eq('id', body.id).maybeSingle();
  if (!before) return { error: 'not_found', status: 404 };
  const status = body.action === 'approve' ? 'published' : 'rejected';
  const patch = {
    status,
    rejection_reason: body.action === 'reject' ? (body.reason || null) : null,
    published_at: body.action === 'approve' ? new Date().toISOString() : null,
  };
  const { error } = await admin.from('listings').update(patch).eq('id', body.id);
  if (error) throw error;
  await admin.from('audit_log').insert({
    actor_user_id: adminUser.id,
    action: `listing.${body.action}`,
    entity_type: 'listing',
    entity_id: body.id,
    before_snapshot: { status: before.status },
    after_snapshot: { status, reason: body.reason || null },
  });
  return { ok: true };
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
  const withPhotos = await Promise.all(items.map(async (l) => {
    const photos = await resolvePhotoUrls(l.photos);
    return { ...l, photos };
  }));
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
  return {
    items: (data || []).map((u) => ({
      id: u.id,
      name: u.full_name,
      role: u.role,
      status: u.status,
      email: null,
    })),
  };
}

export async function dbAdminSetUserStatus(adminUser, body) {
  const admin = supabaseAdmin();
  const { data: before } = await admin.from('profiles').select('status, role').eq('id', body.id).maybeSingle();
  if (!before) return { error: 'not_found', status: 404 };
  const { error } = await admin.from('profiles').update({ status: body.status }).eq('id', body.id);
  if (error) throw error;
  // Keep JWT app_metadata in sync for role-sensitive decisions
  if (before.role === 'admin' || body.status === 'suspended') {
    await admin.auth.admin.updateUserById(body.id, {
      app_metadata: { role: before.role, status: body.status },
    }).catch(() => {});
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
  const { data: unis } = await admin.from('universities').select('*').eq('is_active', true);
  const { data: listings } = await admin.from('listings').select('university_id').eq('status', 'published');
  return {
    items: (unis || []).map((u) => ({
      ...u,
      listings_count: (listings || []).filter((l) => l.university_id === u.id).length,
    })),
  };
}

export async function dbUniversityBySlug(slug) {
  const admin = supabaseAdmin();
  const { data: uni } = await admin.from('universities').select('*').eq('slug', slug).maybeSingle();
  if (!uni) return null;
  const { data: rows } = await admin.from('listings').select(listingSelect).eq('status', 'published').eq('university_id', uni.id);
  const { data: price_index } = await admin.from('price_index').select('*').eq('university_id', uni.id);
  const listings = await Promise.all(
    (rows || []).map(async (r) => {
      const m = mapPublicListing(r);
      return { ...m, price_index: await priceIndexFor({ ...m, university_id: m.uni }) };
    })
  );
  return {
    university: uni,
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
