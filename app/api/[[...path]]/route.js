import { NextResponse } from "next/server";
import {
  LISTINGS, UNIVERSITIES, PACKAGES, PRICE_INDEX, FX_TO_GBP, CURRENCIES,
  toGbp, findIndex, publicListing, getListingByRef, HERO_IMAGE,
} from "@/lib/seed";

// ===========================================================================
// MOCKED API for kibrisogrenci.com. Serves in-memory seed data.
// Contact gating is enforced here: phone numbers are NEVER in list/detail
// responses — only the dedicated /api/reveal endpoint returns them.
// ===========================================================================

const json = (data, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

// naive in-memory daily reveal counter (resets on server restart) — demo only
const revealCounts = new Map(); // key: studentId|date -> count
const DAILY_REVEAL_LIMIT = 15;

function walkMinutes(m) { return Math.round((m / 4500) * 60); }

function priceIndexInfo(l) {
  const pi = findIndex(l.uni, l.property_type, l.bedrooms);
  if (!pi || pi.sample_size < 5) return { enough: false, sample_size: pi ? pi.sample_size : 0 };
  const ratio = l.price_gbp / pi.median_gbp;
  const pct = Math.round(Math.abs(1 - ratio) * 100);
  let position = "at";
  if (ratio < 0.97) position = "below";
  else if (ratio > 1.03) position = "above";
  return { enough: true, median_gbp: pi.median_gbp, p25_gbp: pi.p25_gbp, p75_gbp: pi.p75_gbp,
    sample_size: pi.sample_size, ratio: +ratio.toFixed(3), pct, position };
}

function filterListings(sp) {
  let items = LISTINGS.slice();
  const uni = sp.get("university");
  const city = sp.get("city");
  const ptype = sp.get("property_type");
  const beds = sp.get("bedrooms");
  const furnished = sp.get("furnished");
  const bills = sp.get("bills_included");
  const gender = sp.get("gender");
  const verifiedOnly = sp.get("verified_only");
  const maxWalk = sp.get("max_walk");
  const amenities = (sp.get("amenities") || "").split(",").filter(Boolean);
  const pmin = sp.get("price_min");
  const pmax = sp.get("price_max");
  const featured = sp.get("featured");

  if (uni) items = items.filter(l => l.uni === uni);
  if (city) items = items.filter(l => l.city === city);
  if (ptype) items = items.filter(l => l.property_type === ptype);
  if (beds != null && beds !== "") items = items.filter(l => String(l.bedrooms) === String(beds));
  if (furnished === "true") items = items.filter(l => l.furnished);
  if (bills === "true") items = items.filter(l => l.bills_included);
  if (gender) items = items.filter(l => l.gender_preference === "any" || l.gender_preference === gender);
  if (verifiedOnly === "true") items = items.filter(l => l.landlord.verified);
  if (maxWalk) items = items.filter(l => walkMinutes(l.distance_m) <= Number(maxWalk));
  if (amenities.length) items = items.filter(l => amenities.every(a => l.amenities.includes(a)));
  if (pmin) items = items.filter(l => l.price_gbp >= Number(pmin));
  if (pmax) items = items.filter(l => l.price_gbp <= Number(pmax));
  if (featured === "1") items = items.filter(l => l.featured);

  const sort = sp.get("sort") || "new";
  if (sort === "price_asc") items.sort((a, b) => a.price_gbp - b.price_gbp);
  else if (sort === "price_desc") items.sort((a, b) => b.price_gbp - a.price_gbp);
  else if (sort === "distance") items.sort((a, b) => a.distance_m - b.distance_m);
  else items.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

  return items;
}

async function handle(request, ctx) {
  const params = await ctx.params;
  const path = params?.path || [];
  const route = path.join("/");
  const url = new URL(request.url);
  const sp = url.searchParams;

  try {
    if (route === "config" && request.method === "GET") {
      const publicUnis = UNIVERSITIES.filter(u => u.coordinates_verified);
      return json({
        fx_to_gbp: FX_TO_GBP, currencies: CURRENCIES, hero_image: HERO_IMAGE,
        universities: publicUnis.map(u => ({ ...u, listings_count: LISTINGS.filter(l => l.uni === u.id).length })),
        all_universities: UNIVERSITIES,
        packages: PACKAGES,
        stats: {
          listings: LISTINGS.length,
          universities: publicUnis.length,
          verified_landlords: [...new Set(LISTINGS.filter(l => l.landlord.verified).map(l => l.landlord.name))].length,
          cities: [...new Set(LISTINGS.map(l => l.city))].length,
        },
        cities: [...new Set(LISTINGS.map(l => l.city))],
      });
    }

    if (route === "listings" && request.method === "GET") {
      const items = filterListings(sp);
      const limit = Number(sp.get("limit") || 0);
      const out = (limit ? items.slice(0, limit) : items).map(l => {
        const pub = publicListing(l);
        return { ...pub, price_index: priceIndexInfo(l) };
      });
      return json({ total: items.length, items: out });
    }

    if (path[0] === "listings" && path[1] && request.method === "GET") {
      const l = getListingByRef(path[1]);
      if (!l) return json({ error: "not_found" }, 404);
      const uni = UNIVERSITIES.find(u => u.id === l.uni);
      const similar = LISTINGS
        .filter(s => s.id !== l.id && s.uni === l.uni)
        .slice(0, 3)
        .map(s => ({ ...publicListing(s), price_index: priceIndexInfo(s) }));
      return json({
        ...publicListing(l),
        university: uni ? { id: uni.id, slug: uni.slug, name_tr: uni.name_tr, name_en: uni.name_en, short: uni.short, city: uni.city } : null,
        price_index: priceIndexInfo(l),
        similar,
      });
    }

    if (route === "universities" && request.method === "GET") {
      return json({ items: UNIVERSITIES.map(u => ({ ...u, listings_count: LISTINGS.filter(l => l.uni === u.id).length })) });
    }
    if (path[0] === "universities" && path[1] && request.method === "GET") {
      const uni = UNIVERSITIES.find(u => u.slug === path[1]);
      if (!uni) return json({ error: "not_found" }, 404);
      const listings = LISTINGS.filter(l => l.uni === uni.id)
        .map(l => ({ ...publicListing(l), price_index: priceIndexInfo(l) }));
      const idx = PRICE_INDEX.filter(p => p.university_id === uni.id);
      return json({ university: uni, listings_count: listings.length, listings, price_index: idx });
    }

    if (route === "reveal" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const { ref, signedIn, studentId } = body;
      if (!signedIn || !studentId) return json({ error: "auth_required" }, 401);
      const l = getListingByRef(ref);
      if (!l) return json({ error: "not_found" }, 404);
      const key = `${studentId}|${new Date().toISOString().slice(0, 10)}`;
      const count = revealCounts.get(key) || 0;
      if (count >= DAILY_REVEAL_LIMIT) return json({ error: "rate_limited" }, 429);
      revealCounts.set(key, count + 1);
      const digits = l.landlord.phone.replace(/[^0-9]/g, "");
      const msg = encodeURIComponent(
        `Merhaba, kibrisogrenci.com'daki ${l.reference_code} numaralı ilaniniz hakkinda bilgi almak istiyorum.`
      );
      return json({
        phone: l.landlord.phone,
        whatsapp_url: `https://wa.me/${digits}?text=${msg}`,
        reveals_today: count + 1, limit: DAILY_REVEAL_LIMIT,
      });
    }

    if (route === "reports" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (!body.ref || !body.reason) return json({ error: "invalid" }, 400);
      return json({ ok: true, id: `rep-${Date.now()}` });
    }

    return json({ error: "not_found", route }, 404);
  } catch (e) {
    return json({ error: "server_error" }, 500);
  }
}

export const GET = handle;
export const POST = handle;
