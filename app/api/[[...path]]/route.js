import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  LISTINGS, UNIVERSITIES, PACKAGES, PRICE_INDEX, FX_TO_GBP, CURRENCIES,
  toGbp, findIndex, publicListing, getListingByRef, HERO_IMAGE,
} from "@/lib/seed";

// ===========================================================================
// MOCKED API for kibrisogrenci.com (in-memory). No external calls except the
// real WhatsApp webhook HMAC verification. Contact gating enforced server-side.
// ===========================================================================

const json = (data, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

// ---- in-memory stores (reset on restart; demo only) ----
const revealCounts = new Map();
const DAILY_REVEAL_LIMIT = 15;
const userListings = [];            // landlord-created listings
const auditLog = [];                // append-only audit entries
const waProcessed = new Set();      // wa_message_id dedup
const waOptOut = new Set();         // opted-out phone numbers
let waSpendCents = 0;               // WhatsApp+LLM daily spend tracker (demo)
const WA_SPEND_CEILING = 500;       // demo ceiling in "cents"

const reports = [
  { id: "rep-seed-1", ref: "M9C2W7", reason: "scam", detail: "Görmeden kapora istiyor", status: "open", count: 2, created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
];
const users = [
  { id: "usr-adm", name: "Admin", role: "admin", status: "active", email: "admin@kibrisogrenci.com" },
  { id: "usr-1", name: "Ayşe Yılmaz", role: "landlord", status: "active", email: "ayse@demo" },
  { id: "usr-2", name: "Mehmet Demir", role: "landlord", status: "active", email: "mehmet@demo" },
  { id: "usr-3", name: "Deniz K.", role: "landlord", status: "active", email: "deniz@demo" },
  { id: "usr-s1", name: "Öğrenci Demo", role: "student", status: "active", email: "student@demo" },
];
const invoices = [
  { id: "inv-1", user: "Ayşe Yılmaz", package: "Pro", amount: 2000, currency: "TRY", status: "paid", bank_reference: "KO-PRO-AYSE-01", issued_at: new Date(Date.now() - 20 * 86400000).toISOString() },
  { id: "inv-2", user: "Deniz K.", package: "Starter", amount: 500, currency: "TRY", status: "unpaid", bank_reference: "KO-STA-DENIZ-07", issued_at: new Date(Date.now() - 1 * 86400000).toISOString() },
];

function audit(actor, action, entity_type, entity_id, before, after) {
  auditLog.unshift({ id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actor_user: actor, action, entity_type, entity_id,
    before_snapshot: before || null, after_snapshot: after || null,
    created_at: new Date().toISOString() });
}

function walkMinutes(m) { return Math.round((m / 4500) * 60); }

function priceIndexInfo(l) {
  const pi = findIndex(l.uni, l.property_type, l.bedrooms);
  if (!pi || pi.sample_size < 5) return { enough: false, sample_size: pi ? pi.sample_size : 0 };
  const ratio = l.price_gbp / pi.median_gbp;
  const pct = Math.round(Math.abs(1 - ratio) * 100);
  let position = "at";
  if (ratio < 0.97) position = "below"; else if (ratio > 1.03) position = "above";
  return { enough: true, median_gbp: pi.median_gbp, p25_gbp: pi.p25_gbp, p75_gbp: pi.p75_gbp,
    sample_size: pi.sample_size, ratio: +ratio.toFixed(3), pct, position };
}

function filterListings(sp) {
  let items = LISTINGS.slice();
  const g = (k) => sp.get(k);
  if (g("university")) items = items.filter(l => l.uni === g("university"));
  if (g("city")) items = items.filter(l => l.city === g("city"));
  if (g("property_type")) items = items.filter(l => l.property_type === g("property_type"));
  if (g("bedrooms") != null && g("bedrooms") !== "") items = items.filter(l => String(l.bedrooms) === String(g("bedrooms")));
  if (g("furnished") === "true") items = items.filter(l => l.furnished);
  if (g("bills_included") === "true") items = items.filter(l => l.bills_included);
  if (g("gender")) items = items.filter(l => l.gender_preference === "any" || l.gender_preference === g("gender"));
  if (g("verified_only") === "true") items = items.filter(l => l.landlord.verified);
  if (g("max_walk")) items = items.filter(l => walkMinutes(l.distance_m) <= Number(g("max_walk")));
  const amen = (g("amenities") || "").split(",").filter(Boolean);
  if (amen.length) items = items.filter(l => amen.every(a => l.amenities.includes(a)));
  if (g("price_min")) items = items.filter(l => l.price_gbp >= Number(g("price_min")));
  if (g("price_max")) items = items.filter(l => l.price_gbp <= Number(g("price_max")));
  if (g("featured") === "1") items = items.filter(l => l.featured);
  const sort = g("sort") || "new";
  if (sort === "price_asc") items.sort((a, b) => a.price_gbp - b.price_gbp);
  else if (sort === "price_desc") items.sort((a, b) => b.price_gbp - a.price_gbp);
  else if (sort === "distance") items.sort((a, b) => a.distance_m - b.distance_m);
  else items.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  return items;
}

// ---- WhatsApp helpers ----
const OPTOUT_WORDS = ["stop", "dur", "iptal", "i̇ptal", "стоп", "arret", "arrêt", "توقف"];
function verifyHmac(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function handle(request, ctx) {
  const params = await ctx.params;
  const path = params?.path || [];
  const route = path.join("/");
  const url = new URL(request.url);
  const sp = url.searchParams;
  const method = request.method;

  try {
    // ===================== PUBLIC =====================
    if (route === "config" && method === "GET") {
      const publicUnis = UNIVERSITIES.filter(u => u.coordinates_verified);
      return json({
        fx_to_gbp: FX_TO_GBP, currencies: CURRENCIES, hero_image: HERO_IMAGE,
        universities: publicUnis.map(u => ({ ...u, listings_count: LISTINGS.filter(l => l.uni === u.id).length })),
        all_universities: UNIVERSITIES, packages: PACKAGES,
        stats: {
          listings: LISTINGS.length, universities: publicUnis.length,
          verified_landlords: [...new Set(LISTINGS.filter(l => l.landlord.verified).map(l => l.landlord.name))].length,
          cities: [...new Set(LISTINGS.map(l => l.city))].length,
        },
        cities: [...new Set(LISTINGS.map(l => l.city))],
      });
    }

    if (route === "listings" && method === "GET") {
      const items = filterListings(sp);
      const limit = Number(sp.get("limit") || 0);
      const out = (limit ? items.slice(0, limit) : items).map(l => ({ ...publicListing(l), price_index: priceIndexInfo(l) }));
      return json({ total: items.length, items: out });
    }

    if (path[0] === "listings" && path[1] && method === "GET") {
      const l = getListingByRef(path[1]);
      if (!l) return json({ error: "not_found" }, 404);
      const uni = UNIVERSITIES.find(u => u.id === l.uni);
      const similar = LISTINGS.filter(s => s.id !== l.id && s.uni === l.uni).slice(0, 3)
        .map(s => ({ ...publicListing(s), price_index: priceIndexInfo(s) }));
      return json({ ...publicListing(l),
        university: uni ? { id: uni.id, slug: uni.slug, name_tr: uni.name_tr, name_en: uni.name_en, short: uni.short, city: uni.city } : null,
        price_index: priceIndexInfo(l), similar });
    }

    if (route === "universities" && method === "GET") {
      return json({ items: UNIVERSITIES.map(u => ({ ...u, listings_count: LISTINGS.filter(l => l.uni === u.id).length })) });
    }
    if (path[0] === "universities" && path[1] && method === "GET") {
      const uni = UNIVERSITIES.find(u => u.slug === path[1]);
      if (!uni) return json({ error: "not_found" }, 404);
      const listings = LISTINGS.filter(l => l.uni === uni.id).map(l => ({ ...publicListing(l), price_index: priceIndexInfo(l) }));
      return json({ university: uni, listings_count: listings.length, listings, price_index: PRICE_INDEX.filter(p => p.university_id === uni.id) });
    }

    if (route === "reveal" && method === "POST") {
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
      const msg = encodeURIComponent(`Merhaba, kibrisogrenci.com'daki ${l.reference_code} numarali ilaniniz hakkinda bilgi almak istiyorum.`);
      return json({ phone: l.landlord.phone, whatsapp_url: `https://wa.me/${digits}?text=${msg}`, reveals_today: count + 1, limit: DAILY_REVEAL_LIMIT });
    }

    if (route === "reports" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (!body.ref || !body.reason) return json({ error: "invalid" }, 400);
      const existing = reports.find(r => r.ref === body.ref && r.reason === body.reason && r.status === "open");
      if (existing) { existing.count += 1; return json({ ok: true, id: existing.id, collapsed: true }); }
      const rep = { id: `rep-${Date.now()}`, ref: body.ref, reason: body.reason, detail: body.detail || "", status: "open", count: 1, created_at: new Date().toISOString() };
      reports.unshift(rep);
      return json({ ok: true, id: rep.id });
    }

    // ===================== LANDLORD DASHBOARD =====================
    if (route === "my/listings" && method === "GET") {
      const owner = sp.get("owner") || "Ayşe Yılmaz";
      const mine = LISTINGS.filter(l => l.landlord.name === owner)
        .map(l => ({ id: l.id, reference_code: l.reference_code, title: l.title_tr, status: "published",
          price: l.price, city: l.city, view_count: l.view_count, contact_reveal_count: l.contact_reveal_count,
          photo: l.photos[0], price_index: priceIndexInfo(l) }))
        .concat(userListings.filter(u => u.owner === owner));
      const pkg = PACKAGES.find(p => p.name === "Pro");
      return json({ items: mine, quota: { used: mine.length, total: pkg.listing_quota, package: pkg.name } });
    }
    if (route === "my/listings" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      const owner = b.owner || "Ayşe Yılmaz";
      const pkg = PACKAGES.find(p => p.name === "Pro");
      const mineCount = LISTINGS.filter(l => l.landlord.name === owner).length + userListings.filter(u => u.owner === owner).length;
      if (mineCount >= pkg.listing_quota) return json({ error: "quota_exceeded" }, 402);
      const ref = Math.random().toString(36).replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
      const item = { id: `u-${Date.now()}`, reference_code: ref, owner, title: b.title || "Yeni ilan",
        status: b.draft ? "draft" : "pending_review", price: { amount: Number(b.price_amount) || 0, currency: b.price_currency || "GBP" },
        city: b.city || "Girne", property_type: b.property_type || "apartment", created_at: new Date().toISOString(),
        view_count: 0, contact_reveal_count: 0, photo: LISTINGS[0].photos[0], price_index: { enough: false } };
      userListings.unshift(item);
      audit(owner, "listing.create", "listing", item.id, null, { status: item.status });
      return json({ ok: true, item });
    }
    if (route === "my/analytics" && method === "GET") {
      const weeks = ["-5w", "-4w", "-3w", "-2w", "-1w", "now"];
      return json({ trend: weeks.map((w, i) => ({ week: w, views: 20 + i * 12 + (i % 2) * 6, reveals: 2 + i, saves: 1 + (i % 3), inquiries: (i % 2) })) });
    }
    if (route === "my/inquiries" && method === "GET") {
      return json({ items: [
        { id: "inq-1", ref: "A3F9K2", from: "Öğrenci Demo", message: "Merhaba, hala müsait mi? Eylül için bakıyorum.", source: "web", created_at: new Date(Date.now() - 3600000).toISOString() },
        { id: "inq-2", ref: "A3F9K2", from: "WhatsApp Kullanıcısı", message: "Fiyatta pazarlık olur mu?", source: "whatsapp", created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
      ] });
    }
    if (route === "my/billing" && method === "GET") {
      const owner = sp.get("owner") || "Ayşe Yılmaz";
      return json({
        subscription: { package: "Pro", status: "active", listings_used: 2, listings_total: 15, ends_at: new Date(Date.now() + 60 * 86400000).toISOString() },
        invoices: invoices.filter(i => i.user === owner),
        bank_instructions: { bank: "Kıbrıs Vakıflar Bankası", iban: "TR00 0000 0000 0000 0000 0000 00", reference: "KO-PRO-AYSE-01" },
      });
    }

    // ===================== ADMIN =====================
    if (route === "admin/queue" && method === "GET") {
      const seedPending = LISTINGS.filter(l => l.risk_flags && l.risk_flags.length > 0)
        .map(l => ({ id: l.id, reference_code: l.reference_code, title: l.title_tr, owner: l.landlord.name,
          status: "pending_review", risk_flags: l.risk_flags, photo: l.photos[0],
          price: l.price, priority: true }));
      const created = userListings.filter(u => u.status === "pending_review")
        .map(u => ({ ...u, risk_flags: [], priority: false }));
      return json({ items: [...seedPending, ...created] });
    }
    if (route === "admin/review" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      const item = userListings.find(u => u.id === b.id);
      const before = item ? item.status : "pending_review";
      if (item) item.status = b.action === "approve" ? "published" : "rejected";
      audit("Admin", `listing.${b.action}`, "listing", b.id, { status: before }, { status: b.action === "approve" ? "published" : "rejected", reason: b.reason || null });
      return json({ ok: true });
    }
    if (route === "admin/reports" && method === "GET") return json({ items: reports });
    if (route === "admin/reports/resolve" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      const r = reports.find(x => x.id === b.id);
      if (r) r.status = "resolved";
      audit("Admin", "report.resolve", "report", b.id, { status: "open" }, { status: "resolved", action: b.action || "unpublish" });
      return json({ ok: true });
    }
    if (route === "admin/users" && method === "GET") return json({ items: users });
    if (route === "admin/users/status" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      const u = users.find(x => x.id === b.id);
      const before = u ? u.status : null;
      if (u) u.status = b.status;
      audit("Admin", "user.status", "user", b.id, { status: before }, { status: b.status });
      return json({ ok: true });
    }
    if (route === "admin/invoices" && method === "GET") return json({ items: invoices });
    if (route === "admin/invoices/pay" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      const inv = invoices.find(x => x.id === b.id);
      const before = inv ? inv.status : null;
      if (inv) { inv.status = "paid"; inv.marked_paid_at = new Date().toISOString(); inv.bank_reference = b.bank_reference || inv.bank_reference; }
      audit("Admin", "invoice.mark_paid", "invoice", b.id, { status: before }, { status: "paid", subscription: "activated", bank_reference: inv?.bank_reference });
      return json({ ok: true, subscription_activated: true });
    }
    if (route === "admin/coords" && method === "GET") {
      return json({ items: UNIVERSITIES.map(u => ({ id: u.id, short: u.short, name: u.name_tr, city: u.city, coordinates_verified: u.coordinates_verified, lat: u.lat, lng: u.lng })) });
    }
    if (route === "admin/coords/verify" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      const u = UNIVERSITIES.find(x => x.id === b.id);
      if (u) u.coordinates_verified = true;
      audit("Admin", "university.verify_coords", "university", b.id, { coordinates_verified: false }, { coordinates_verified: true });
      return json({ ok: true });
    }
    if (route === "admin/audit" && method === "GET") return json({ items: auditLog.slice(0, 100) });
    if (route === "admin/health" && method === "GET") {
      return json({ items: [
        { check_name: "smtp_canary", status: "ok", detail: "Son canary e-postası başarılı (MOCK)", checked_at: new Date().toISOString() },
        { check_name: "fx_rates", status: "ok", detail: "Son FX güncellemesi 4 saat önce (MOCK)", checked_at: new Date().toISOString() },
        { check_name: "storage", status: "ok", detail: "Supabase Storage erişilebilir (MOCK)", checked_at: new Date().toISOString() },
        { check_name: "whatsapp_spend", status: waSpendCents >= WA_SPEND_CEILING ? "fail" : "ok", detail: `Günlük harcama ${waSpendCents}/${WA_SPEND_CEILING} (MOCK)`, checked_at: new Date().toISOString() },
      ] });
    }

    // ===================== WHATSAPP =====================
    // Real webhook verification challenge (GET)
    if (route === "whatsapp/webhook" && method === "GET") {
      const mode = sp.get("hub.mode");
      const token = sp.get("hub.verify_token");
      const challenge = sp.get("hub.challenge");
      if (mode === "subscribe" && token && token === (process.env.WHATSAPP_VERIFY_TOKEN || "")) {
        return new NextResponse(challenge || "", { status: 200 });
      }
      return json({ error: "forbidden" }, 403);
    }
    // Real webhook inbound (POST) — verify HMAC BEFORE parsing
    if (route === "whatsapp/webhook" && method === "POST") {
      const raw = await request.text();
      const sig = request.headers.get("x-hub-signature-256");
      const secret = process.env.WHATSAPP_APP_SECRET || "";
      if (!verifyHmac(raw, sig, secret)) return json({ error: "invalid_signature" }, 403);
      let payload; try { payload = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }
      const msgId = payload?.wa_message_id || payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
      const from = payload?.from || payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
      const text = (payload?.text || payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || "").trim();
      if (from && OPTOUT_WORDS.includes(text.toLowerCase())) { waOptOut.add(from); return json({ ok: true, opted_out: true }); }
      if (from && waOptOut.has(from)) return json({ ok: true, suppressed: true });
      if (msgId) { if (waProcessed.has(msgId)) return json({ ok: true, duplicate: true }); waProcessed.add(msgId); }
      // (Real handler would create draft listing / run search here.)
      return json({ ok: true, processed_message_id: msgId || null });
    }
    // Demo simulator (not the real webhook)
    if (route === "whatsapp/sim" && method === "POST") {
      const b = await request.json().catch(() => ({}));
      const msg = (b.message || "").toLowerCase();
      if (b.flow === "landlord") {
        const price = (msg.match(/\d{2,6}/) || ["6000"])[0];
        return json({ reply_type: "summary", extracted: {
          property_type: msg.includes("stüdyo") || msg.includes("studio") ? "studio" : (msg.includes("oda") ? "room" : "apartment"),
          bedrooms: (msg.match(/(\d)\+1/) || [null, "2"])[1], price_amount: price,
          price_currency: msg.includes("£") || msg.includes("gbp") ? "GBP" : (msg.includes("$") ? "USD" : "TRY"),
          neighbourhood: msg.includes("girne") ? "Girne" : (msg.includes("mağusa") || msg.includes("magusa") ? "Gazimağusa" : "Lefkoşa"),
          furnished: !msg.includes("eşyasız"),
        }, note: "Bilgileri onaylıyor musunuz? Onaylarsanız ilan admin incelemesine (pending_review) düşer. WhatsApp yolu asla incelemeyi atlamaz." });
      }
      // student search
      let items = LISTINGS.slice();
      if (msg.includes("girne")) items = items.filter(l => l.city === "Girne");
      else if (msg.includes("mağusa") || msg.includes("magusa") || msg.includes("emu")) items = items.filter(l => l.city === "Gazimağusa");
      else if (msg.includes("lefkoşa") || msg.includes("lefkosa") || msg.includes("neu") || msg.includes("ciu")) items = items.filter(l => l.city === "Lefkoşa");
      if (msg.includes("verified") || msg.includes("doğrulanmış") || msg.includes("dogrulanmis")) items = items.filter(l => l.landlord.verified);
      if (msg.includes("ucuz") || msg.includes("cheap") || msg.includes("uygun")) items.sort((a, b) => a.price_gbp - b.price_gbp);
      const cards = items.slice(0, 5).map(l => ({ ref: l.reference_code, title: l.title_tr, price: l.price,
        walking_minutes: walkMinutes(l.distance_m), city: l.city, photo: l.photos[0], verified: l.landlord.verified }));
      return json({ reply_type: "cards", cards, note: "Web ile aynı görünürlük kuralları uygulanır. İletişim ancak hesabınız bağlıysa açılır." });
    }

    return json({ error: "not_found", route }, 404);
  } catch (e) {
    return json({ error: "server_error" }, 500);
  }
}

export const GET = handle;
export const POST = handle;
