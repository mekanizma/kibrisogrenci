import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseForToken } from '@/lib/supabase/server';

function walkMinutes(m) {
  if (m == null) return null;
  return Math.round((Number(m) / 4500) * 60);
}

function mapPublicListing(row, extras = {}) {
  if (!row) return null;
  const photos = (row.listing_photos || [])
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
    photos,
    featured: extras.featured || false,
    risk_flags: row.risk_flags || [],
    published_at: row.published_at,
    last_confirmed_available_at: row.last_confirmed_available_at,
    view_count: row.view_count,
    contact_reveal_count: row.contact_reveal_count,
    landlord_name: lp?.display_name || null,
    landlord_is_agency: !!lp?.is_agency,
    landlord_verified: lp?.verification_status === 'verified',
    // never expose phone / address_private / exact coords here
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
  else q = q.order('published_at', { ascending: false });

  const { data, error } = await q;
  if (error) throw error;

  let items = (data || []).map((row) => mapPublicListing(row));
  if (sp.get('verified_only') === 'true') {
    items = items.filter((l) => l.landlord_verified);
  }
  const amen = (sp.get('amenities') || '').split(',').filter(Boolean);
  if (amen.length) items = items.filter((l) => amen.every((a) => (l.amenities || []).includes(a)));

  const withIndex = await Promise.all(
    items.map(async (l) => ({ ...l, price_index: await priceIndexFor({ ...l, university_id: l.uni }) }))
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
  const { data: uni } = await admin.from('universities').select('id, slug, name_tr, name_en, city').eq('id', data.university_id).maybeSingle();
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
          short: (uni.name_en || '').slice(0, 3).toUpperCase(),
          city: uni.city,
        }
      : null,
    price_index: await priceIndexFor({ ...mapped, university_id: mapped.uni }),
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

  const mapped = (items || []).map((l) => ({
    id: l.id,
    reference_code: l.reference_code,
    title: l.title_tr,
    status: l.status,
    price: { amount: Number(l.price_amount), currency: l.price_currency },
    city: l.city,
    view_count: l.view_count,
    contact_reveal_count: l.contact_reveal_count,
    photo: (l.listing_photos || []).sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_key || null,
  }));

  return {
    items: mapped,
    quota: {
      used: mapped.length,
      total: sub?.packages?.listing_quota || 0,
      package: sub?.packages?.name || null,
    },
  };
}

export async function dbCreateListing(user, body) {
  const client = supabaseForToken(user.accessToken);
  let { data: lp } = await client.from('landlord_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!lp) {
    const { data: created, error } = await client
      .from('landlord_profiles')
      .insert({ user_id: user.id, display_name: user.profile?.full_name || user.email })
      .select('id')
      .single();
    if (error) throw error;
    lp = created;
  }

  const mine = await dbMyListings(user);
  if (mine.quota.total > 0 && mine.quota.used >= mine.quota.total) {
    return { error: 'quota_exceeded', status: 402 };
  }

  const ref = Math.random().toString(36).replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
  const status = body.draft ? 'draft' : 'pending_review';
  const { data, error } = await client
    .from('listings')
    .insert({
      landlord_id: lp.id,
      reference_code: ref,
      title_tr: body.title || 'Yeni ilan',
      title_en: body.title || 'New listing',
      description_tr: body.description || '',
      description_en: body.description || '',
      property_type: body.property_type || 'apartment',
      bedrooms: Number(body.bedrooms) || 0,
      price_amount: Number(body.price_amount) || 0,
      price_currency: body.price_currency || 'GBP',
      city: body.city || 'Girne',
      neighbourhood: body.neighbourhood || null,
      status,
      amenities: body.amenities || [],
    })
    .select('id, reference_code, title_tr, status, price_amount, price_currency, city, created_at')
    .single();
  if (error) throw error;

  await supabaseAdmin().from('audit_log').insert({
    actor_user_id: user.id,
    action: 'listing.create',
    entity_type: 'listing',
    entity_id: data.id,
    after_snapshot: { status: data.status },
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
    },
  };
}

export async function dbAdminQueue() {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('listings')
    .select('id, reference_code, title_tr, status, risk_flags, price_amount, price_currency, landlord_profiles(display_name), listing_photos(storage_key, sort_order)')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true });
  return {
    items: (data || []).map((l) => ({
      id: l.id,
      reference_code: l.reference_code,
      title: l.title_tr,
      owner: l.landlord_profiles?.display_name,
      status: l.status,
      risk_flags: l.risk_flags || [],
      photo: (l.listing_photos || [])[0]?.storage_key,
      price: { amount: Number(l.price_amount), currency: l.price_currency },
      priority: (l.risk_flags || []).length > 0,
    })),
  };
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
  return { items };
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
