'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Search, MapPin, ShieldCheck, BadgeCheck, Wifi, Snowflake, Car, Waves,
  Dumbbell, AlertTriangle, ChevronLeft, Menu, Globe, TrendingDown, TrendingUp,
  Phone, MessageCircle, X, Check, GraduationCap, Building2, Info, Clock,
  BedDouble, Bath, Maximize, Flag, Lock, Sofa, Trees, ShieldAlert, Waypoints, Users,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { messages, tFor } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const SYMBOL = { TRY: '₺', GBP: '£', USD: '$', EUR: '€' };
const LOCALE_TAG = { tr: 'tr-TR', en: 'en-GB' };

function fmtMoney(amount, currency, locale) {
  const n = Number(amount).toLocaleString(LOCALE_TAG[locale] || 'en-GB');
  return `${SYMBOL[currency] || ''}${n}`;
}
function convertMoney(amount, from, to, fx) {
  const gbp = amount * (fx[from] || 1);
  return Math.round(gbp / (fx[to] || 1));
}

const AMENITY = {
  wifi: { tr: 'İnternet', en: 'Wi-Fi', icon: Wifi },
  ac: { tr: 'Klima', en: 'Air conditioning', icon: Snowflake },
  parking: { tr: 'Otopark', en: 'Parking', icon: Car },
  pool: { tr: 'Havuz', en: 'Pool', icon: Waves },
  gym: { tr: 'Spor salonu', en: 'Gym', icon: Dumbbell },
  washing_machine: { tr: 'Çamaşır makinesi', en: 'Washing machine', icon: Sofa },
  balcony: { tr: 'Balkon', en: 'Balcony', icon: Building2 },
  elevator: { tr: 'Asansör', en: 'Elevator', icon: Building2 },
  security: { tr: 'Güvenlik', en: 'Security', icon: ShieldCheck },
  garden: { tr: 'Bahçe', en: 'Garden', icon: Trees },
  study_room: { tr: 'Çalışma odası', en: 'Study room', icon: GraduationCap },
  furnished_kitchen: { tr: 'Donanımlı mutfak', en: 'Fitted kitchen', icon: Sofa },
  sea_view: { tr: 'Deniz manzarası', en: 'Sea view', icon: Waves },
};

async function api(path, opts) {
  const res = await fetch(`/api/${path}`, opts);
  return res;
}

// ---------------------------------------------------------------------------
// small presentational components (module scope = stable identity)
// ---------------------------------------------------------------------------
function VerifiedPill({ t, small }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-[#dcfce7] text-[#15803d] font-semibold ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}>
      <BadgeCheck className={small ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {t('trust.verified_badge')}
    </span>
  );
}

function PriceIndexPill({ pi, t, listing }) {
  if (!pi) return null;
  if (!pi.enough) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-500 px-2.5 py-1 text-xs font-medium">
        <Info className="h-3.5 w-3.5" /> {t('priceindex.not_enough')}
      </span>
    );
  }
  if (pi.position === 'below') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] text-[#15803d] px-2.5 py-1 text-xs font-semibold">
        <TrendingDown className="h-3.5 w-3.5" /> {t('priceindex.below', { n: pi.pct })}
      </span>
    );
  }
  if (pi.position === 'above') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 text-xs font-semibold">
        <TrendingUp className="h-3.5 w-3.5" /> {t('priceindex.above', { n: pi.pct })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2.5 py-1 text-xs font-medium">
      {t('priceindex.at')}
    </span>
  );
}

function PriceDisplay({ price, currency, fx, locale, t, size = 'lg' }) {
  const same = price.currency === currency;
  const main = same ? fmtMoney(price.amount, price.currency, locale)
    : `≈ ${fmtMoney(convertMoney(price.amount, price.currency, currency, fx), currency, locale)}`;
  const cls = size === 'lg' ? 'text-2xl' : 'text-lg';
  return (
    <div>
      <span className={`${cls} font-bold text-[#0a3d54]`}>{main}</span>
      <span className="text-sm text-slate-500 font-medium">{t('listing.per_month')}</span>
      {!same && (
        <div className="text-xs text-slate-400">{t('common.listed_as')}: {fmtMoney(price.amount, price.currency, locale)}</div>
      )}
    </div>
  );
}

function ListingCard({ l, t, locale, currency, fx, onOpen }) {
  const risky = (l.risk_flags || []).length > 0;
  return (
    <button
      onClick={() => onOpen(l.reference_code)}
      className="group text-start bg-white rounded-2xl overflow-hidden border border-slate-200 hover:shadow-lg hover:border-[#0a4d68]/30 transition-all flex flex-col"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <img src={l.photos[0]} alt={locale === 'tr' ? l.title_tr : l.title_en}
          loading="lazy"
          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute top-2 start-2 flex gap-1.5">
          {l.landlord_verified && <VerifiedPill t={t} small />}
          {l.landlord_is_agency && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 text-slate-700 px-2 py-0.5 text-[11px] font-semibold">
              <Building2 className="h-3 w-3" /> {t('listing.agency')}
            </span>
          )}
        </div>
        <div className="absolute bottom-2 start-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#0a4d68] text-white px-2 py-1 text-[11px] font-semibold shadow">
            <Waypoints className="h-3 w-3" /> {l.walking_minutes} dk · {(l.distance_m / 1000).toFixed(1)}km
          </span>
        </div>
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <MapPin className="h-3.5 w-3.5" /> {l.neighbourhood}, {l.city}
        </div>
        <h3 className="font-semibold text-slate-800 leading-snug line-clamp-2 min-h-[2.6rem]">
          {locale === 'tr' ? l.title_tr : l.title_en}
        </h3>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{t(`ptype.${l.property_type}`)}</span>
          <span>·</span>
          {l.property_type === 'room'
            ? <span>{t('listing.private_room')}</span>
            : (l.bedrooms > 0 ? <span>{l.bedrooms} {t('listing.bedrooms_n')}</span> : <span>{t('ptype.studio')}</span>)}
          <span>·</span>
          <span>{l.size_sqm} m²</span>
        </div>
        {l.room_share && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#0a4d68]/10 text-[#0a4d68] px-2 py-0.5 text-[11px] font-semibold">
            <Users className="h-3 w-3" /> {t('listing.shared')} · +{l.flatmates} {t('listing.flatmates')}
          </span>
        )}
        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <PriceDisplay price={l.price} currency={currency} fx={fx} locale={locale} t={t} size="md" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <PriceIndexPill pi={l.price_index} t={t} listing={l} />
        </div>
      </div>
    </button>
  );
}

function ScamBanner({ t, compact }) {
  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50 ${compact ? 'p-3' : 'p-4'} flex gap-3`}>
      <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold text-amber-900 text-sm">{t('scam.banner_title')}</div>
        <p className="text-sm text-amber-800 mt-0.5 leading-relaxed">{t('scam.banner')}</p>
      </div>
    </div>
  );
}

function MapCircle({ l, t }) {
  return (
    <div className="relative h-56 w-full rounded-xl overflow-hidden border border-slate-200 bg-gradient-to-br from-[#e8f2f6] to-[#dbeafe]">
      <div className="absolute inset-0 opacity-40"
        style={{ backgroundImage: 'linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-28 w-28 rounded-full bg-[#0a4d68]/20 border-2 border-[#0a4d68]/40 flex items-center justify-center animate-pulse">
          <div className="h-16 w-16 rounded-full bg-[#0a4d68]/30" />
        </div>
      </div>
      <div className="absolute bottom-2 start-2 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs text-slate-600 flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 text-[#0a4d68]" /> {l.neighbourhood}, {l.city} · {t('listing.approx_location')}
      </div>
    </div>
  );
}

function PriceHistoryChart({ history, currency, fx, locale, t }) {
  const data = history.map(h => ({
    date: new Date(h.changed_at).toLocaleDateString(LOCALE_TAG[locale], { month: 'short' }),
    value: convertMoney(h.price.amount, h.price.currency, currency, fx),
  }));
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={48}
            tickFormatter={(v) => `${SYMBOL[currency]}${v}`} />
          <Tooltip formatter={(v) => [`${SYMBOL[currency]}${Number(v).toLocaleString()}`, t('priceindex.history')]} />
          <Line type="monotone" dataKey="value" stroke="#0a4d68" strokeWidth={2.5} dot={{ r: 3, fill: '#0a4d68' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// Main App
// ===========================================================================
export default function App() {
  const [locale, setLocale] = useState('tr');
  const [currency, setCurrency] = useState('GBP');
  const [config, setConfig] = useState(null);
  const [view, setView] = useState({ name: 'home' });
  const [auth, setAuth] = useState({ signedIn: false });
  const [authModal, setAuthModal] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const t = useMemo(() => tFor(locale), [locale]);
  const fx = config?.fx_to_gbp || { TRY: 0.0234, USD: 0.79, EUR: 0.855, GBP: 1 };

  useEffect(() => {
    api('config').then(r => r.json()).then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.scrollTo(0, 0);
  }, [view, locale]);

  const goSearch = useCallback((filters = {}) => setView({ name: 'search', filters }), []);
  const goListing = useCallback((ref) => setView({ name: 'listing', ref }), []);
  const goUniversity = useCallback((slug) => setView({ name: 'university', slug }), []);

  const shared = { t, locale, currency, fx, config, goSearch, goListing, goUniversity,
    auth, setAuth, setAuthModal, setReportModal };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800">
      <Header {...shared} locale={locale} setLocale={setLocale} currency={currency} setCurrency={setCurrency}
        setView={setView} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      {/* Demo banner */}
      <div className="bg-[#0a3d54] text-white/90 text-center text-xs py-1.5 px-4">
        {t('demo_banner')}
      </div>

      <main>
        {view.name === 'home' && <HomeView {...shared} setView={setView} />}
        {view.name === 'search' && <SearchView {...shared} initialFilters={view.filters} />}
        {view.name === 'listing' && <ListingView {...shared} refCode={view.ref} setView={setView} />}
        {view.name === 'university' && <UniversityView {...shared} slug={view.slug} />}
        {view.name === 'scam' && <StaticView {...shared} kind="scam" />}
        {view.name === 'how' && <StaticView {...shared} kind="how" />}
      </main>

      <Footer t={t} config={config} setView={setView} goUniversity={goUniversity} />

      {authModal && <AuthModal t={t} onClose={() => setAuthModal(false)} setAuth={setAuth} />}
      {reportModal && <ReportModal t={t} refCode={reportModal} onClose={() => setReportModal(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function Header({ t, locale, setLocale, currency, setCurrency, setView, auth, setAuth, setAuthModal, config }) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="container flex items-center justify-between h-16 gap-3">
        <button onClick={() => setView({ name: 'home' })} className="flex items-center gap-2.5 shrink-0">
          <img src="/logo.png" alt={t('brand')} className="h-11 w-11 object-contain" />
          <div className="text-start leading-none">
            <div className="font-bold text-[#0a3d54] text-lg">{t('brand')}</div>
            <div className="text-[10px] text-slate-500 hidden sm:block">{t('tagline')}</div>
          </div>
        </button>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button onClick={() => setView({ name: 'search', filters: {} })} className="hover:text-[#0a4d68]">{t('nav.search')}</button>
          <button onClick={() => setView({ name: 'how' })} className="hover:text-[#0a4d68]">{t('nav.how')}</button>
          <button onClick={() => setView({ name: 'scam' })} className="hover:text-[#0a4d68]">{t('nav.scam')}</button>
        </nav>

        <div className="flex items-center gap-2">
          <select value={currency} onChange={e => setCurrency(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-600 focus:ring-2 focus:ring-[#0a4d68]/30 outline-none">
            {(config?.currencies || ['TRY', 'GBP', 'USD', 'EUR']).map(c => <option key={c} value={c}>{SYMBOL[c]} {c}</option>)}
          </select>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {['tr', 'en'].map(l => (
              <button key={l} onClick={() => setLocale(l)}
                className={`px-2.5 h-9 text-sm font-semibold ${locale === l ? 'bg-[#0a4d68] text-white' : 'bg-white text-slate-500'}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {auth.signedIn ? (
            <button onClick={() => setAuth({ signedIn: false })}
              className="hidden sm:inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
              {t('nav.signout')}
            </button>
          ) : (
            <button onClick={() => setAuthModal(true)}
              className="inline-flex h-9 items-center rounded-lg bg-[#0a4d68] px-3.5 text-sm font-semibold text-white hover:bg-[#08415c]">
              {t('nav.signin')}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
function HomeView({ t, locale, currency, fx, config, goSearch, goListing, goUniversity, setView }) {
  const [featured, setFeatured] = useState([]);
  const [uni, setUni] = useState('');
  const [budget, setBudget] = useState('');
  const [movein, setMovein] = useState('');

  useEffect(() => {
    api('listings?featured=1&limit=6').then(r => r.json()).then(d => setFeatured(d.items || [])).catch(() => {});
  }, []);

  const stats = config?.stats;
  const unis = config?.universities || [];

  return (
    <div>
      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0">
          <img src={config?.hero_image} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#08304a]/90 via-[#0a4d68]/80 to-[#0a4d68]/50" />
        </div>
        <div className="relative container py-16 md:py-24">
          <div className="max-w-2xl text-white">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium mb-4">
              <ShieldCheck className="h-4 w-4 text-[#7ee2a8]" /> KKTC · North Cyprus
            </span>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight">{t('hero.title')}</h1>
            <p className="mt-4 text-white/85 text-base md:text-lg leading-relaxed">{t('hero.subtitle')}</p>

            {/* Search box */}
            <div className="mt-8 bg-white rounded-2xl p-3 shadow-xl grid grid-cols-1 sm:grid-cols-[1.3fr_1fr_1fr_auto] gap-2">
              <select value={uni} onChange={e => setUni(e.target.value)}
                className="h-12 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#0a4d68]/30">
                <option value="">{t('search.any_university')}</option>
                {unis.map(u => <option key={u.id} value={u.id}>{u.short} — {locale === 'tr' ? u.name_tr : u.name_en}</option>)}
              </select>
              <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder={`${t('search.budget')} (${SYMBOL[currency]})`}
                className="h-12 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#0a4d68]/30" />
              <input type="date" value={movein} onChange={e => setMovein(e.target.value)}
                className="h-12 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#0a4d68]/30" />
              <button onClick={() => goSearch({ university: uni, price_max_display: budget ? convertMoney(Number(budget), currency, 'GBP', fx) : '', movein })}
                className="h-12 rounded-xl bg-[#e0a256] hover:bg-[#d4923f] px-6 font-semibold text-[#3a2606] inline-flex items-center justify-center gap-2">
                <Search className="h-5 w-5" /> {t('search.button')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      {stats && (
        <section className="container -mt-8 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['listings', stats.listings], ['universities', stats.universities], ['verified_landlords', stats.verified_landlords], ['cities', stats.cities]].map(([k, v]) => (
              <div key={k} className="bg-white rounded-xl border border-slate-200 p-4 text-center shadow-sm">
                <div className="text-2xl font-bold text-[#0a4d68]">{v}</div>
                <div className="text-xs text-slate-500 mt-0.5 capitalize">{k.replace('_', ' ')}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Featured */}
      <section className="container py-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl md:text-2xl font-bold text-[#0a3d54]">{locale === 'tr' ? 'Öne çıkan ilanlar' : 'Featured listings'}</h2>
          <button onClick={() => goSearch({})} className="text-sm font-semibold text-[#0a4d68] hover:underline">
            {t('nav.search')} →
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {featured.map(l => <ListingCard key={l.id} l={l} t={t} locale={locale} currency={currency} fx={fx} onOpen={goListing} />)}
        </div>
      </section>

      {/* How we build trust */}
      <section className="bg-white border-y border-slate-200 py-14">
        <div className="container">
          <h2 className="text-xl md:text-2xl font-bold text-[#0a3d54] text-center">{t('trust.how_title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mt-8">
            {t('trust.how_items').map((it, i) => {
              const Icon = [BadgeCheck, TrendingDown, ShieldAlert, Clock][i];
              return (
                <div key={i} className="rounded-2xl border border-slate-200 p-5">
                  <div className="h-11 w-11 rounded-xl bg-[#e8f2f6] flex items-center justify-center mb-3">
                    <Icon className="h-5 w-5 text-[#0a4d68]" />
                  </div>
                  <div className="font-semibold text-slate-800">{it.t}</div>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed">{it.d}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Universities */}
      <section className="container py-14">
        <h2 className="text-xl md:text-2xl font-bold text-[#0a3d54] mb-5">{t('universities.title')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {unis.map(u => (
            <button key={u.id} onClick={() => goUniversity(u.slug)}
              className="text-start rounded-2xl border border-slate-200 bg-white p-5 hover:border-[#0a4d68]/40 hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-2">
                <GraduationCap className="h-5 w-5 text-[#0a4d68]" />
                <span className="text-xs font-semibold text-[#0a4d68] bg-[#e8f2f6] rounded px-1.5 py-0.5">{u.short}</span>
              </div>
              <div className="font-semibold text-slate-800 leading-snug">{locale === 'tr' ? u.name_tr : u.name_en}</div>
              <div className="text-xs text-slate-500 mt-1">{u.city} · {u.listings_count} {t('universities.listings_count')}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Scam guide teaser */}
      <section className="container pb-16">
        <ScamBanner t={t} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
const AMENITY_KEYS = Object.keys(AMENITY);

function SearchView({ t, locale, currency, fx, config, goListing, initialFilters }) {
  const unis = config?.universities || [];
  const cities = config?.cities || [];
  const [f, setF] = useState({
    university: initialFilters?.university || '',
    city: '', property_type: '', bedrooms: '', gender: '',
    furnished: false, bills_included: false, verified_only: false,
    max_walk: '', price_min: '', price_max: initialFilters?.price_max_display || '',
    amenities: [], sort: 'new',
  });
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const runSearch = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (f.university) p.set('university', f.university);
    if (f.city) p.set('city', f.city);
    if (f.property_type) p.set('property_type', f.property_type);
    if (f.bedrooms !== '') p.set('bedrooms', f.bedrooms);
    if (f.gender) p.set('gender', f.gender);
    if (f.furnished) p.set('furnished', 'true');
    if (f.bills_included) p.set('bills_included', 'true');
    if (f.verified_only) p.set('verified_only', 'true');
    if (f.max_walk) p.set('max_walk', f.max_walk);
    if (f.amenities.length) p.set('amenities', f.amenities.join(','));
    // price inputs are in display currency -> convert to GBP for the API
    if (f.price_min) p.set('price_min', convertMoney(Number(f.price_min), currency, 'GBP', fx));
    if (f.price_max) p.set('price_max', convertMoney(Number(f.price_max), currency, 'GBP', fx));
    p.set('sort', f.sort);
    api(`listings?${p.toString()}`).then(r => r.json()).then(d => {
      setItems(d.items || []); setTotal(d.total || 0); setLoading(false);
    }).catch(() => setLoading(false));
  }, [f, currency, fx]);

  useEffect(() => { runSearch(); }, [runSearch]);

  const toggleAmenity = (a) => setF(s => ({ ...s, amenities: s.amenities.includes(a) ? s.amenities.filter(x => x !== a) : [...s.amenities, a] }));
  const clear = () => setF({ university: '', city: '', property_type: '', bedrooms: '', gender: '', furnished: false, bills_included: false, verified_only: false, max_walk: '', price_min: '', price_max: '', amenities: [], sort: 'new' });

  const FilterField = ({ label, children }) => (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
  const selCls = 'w-full h-10 rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/30';

  return (
    <div className="container py-8">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        {/* Filters */}
        <aside className="lg:sticky lg:top-24 h-fit bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[#0a3d54]">{t('search.filters')}</h2>
            <button onClick={clear} className="text-xs font-semibold text-[#0a4d68] hover:underline">{t('search.clear')}</button>
          </div>
          <FilterField label={t('search.university')}>
            <select className={selCls} value={f.university} onChange={e => setF(s => ({ ...s, university: e.target.value }))}>
              <option value="">{t('search.any_university')}</option>
              {unis.map(u => <option key={u.id} value={u.id}>{u.short}</option>)}
            </select>
          </FilterField>
          <FilterField label={t('search.max_walk')}>
            <select className={selCls} value={f.max_walk} onChange={e => setF(s => ({ ...s, max_walk: e.target.value }))}>
              <option value="">{t('search.any')}</option>
              {[5, 10, 15, 20, 30].map(w => <option key={w} value={w}>{w} dk</option>)}
            </select>
          </FilterField>
          <FilterField label={t('search.city')}>
            <select className={selCls} value={f.city} onChange={e => setF(s => ({ ...s, city: e.target.value }))}>
              <option value="">{t('search.any_city')}</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FilterField>
          <FilterField label={`${t('search.price_range')} (${SYMBOL[currency]})`}>
            <div className="flex gap-2">
              <input type="number" placeholder="min" className={selCls} value={f.price_min} onChange={e => setF(s => ({ ...s, price_min: e.target.value }))} />
              <input type="number" placeholder="max" className={selCls} value={f.price_max} onChange={e => setF(s => ({ ...s, price_max: e.target.value }))} />
            </div>
          </FilterField>
          <FilterField label={t('search.property_type')}>
            <select className={selCls} value={f.property_type} onChange={e => setF(s => ({ ...s, property_type: e.target.value }))}>
              <option value="">{t('search.any')}</option>
              {['apartment', 'studio', 'room', 'house'].map(p => <option key={p} value={p}>{t(`ptype.${p}`)}</option>)}
            </select>
          </FilterField>
          <FilterField label={t('search.bedrooms')}>
            <select className={selCls} value={f.bedrooms} onChange={e => setF(s => ({ ...s, bedrooms: e.target.value }))}>
              <option value="">{t('search.any')}</option>
              {[0, 1, 2, 3].map(b => <option key={b} value={b}>{b === 0 ? t('ptype.studio') : `${b}+`}</option>)}
            </select>
          </FilterField>
          <FilterField label={t('search.gender')}>
            <select className={selCls} value={f.gender} onChange={e => setF(s => ({ ...s, gender: e.target.value }))}>
              <option value="">{t('gender.any')}</option>
              <option value="female">{t('gender.female')}</option>
              <option value="male">{t('gender.male')}</option>
            </select>
          </FilterField>
          <div className="space-y-2.5 mb-4">
            {[['furnished', t('search.furnished')], ['bills_included', t('search.bills_included')], ['verified_only', t('search.verified_only')]].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={f[k]} onChange={e => setF(s => ({ ...s, [k]: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 accent-[#0a4d68]" />
                {label}
              </label>
            ))}
          </div>
          <FilterField label={t('search.amenities')}>
            <div className="flex flex-wrap gap-1.5">
              {AMENITY_KEYS.map(a => (
                <button key={a} onClick={() => toggleAmenity(a)}
                  className={`text-xs rounded-full px-2.5 py-1 border ${f.amenities.includes(a) ? 'bg-[#0a4d68] text-white border-[#0a4d68]' : 'bg-white text-slate-600 border-slate-200'}`}>
                  {AMENITY[a][locale]}
                </button>
              ))}
            </div>
          </FilterField>
        </aside>

        {/* Results */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-600"><span className="font-bold text-[#0a3d54]">{total}</span> {t('search.results')}</div>
            <select className="h-10 rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none" value={f.sort} onChange={e => setF(s => ({ ...s, sort: e.target.value }))}>
              <option value="new">{t('search.sort_new')}</option>
              <option value="price_asc">{t('search.sort_price_asc')}</option>
              <option value="price_desc">{t('search.sort_price_desc')}</option>
              <option value="distance">{t('search.sort_distance')}</option>
            </select>
          </div>
          {loading ? (
            <div className="text-center py-20 text-slate-400">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-slate-400">{t('search.no_results')}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {items.map(l => <ListingCard key={l.id} l={l} t={t} locale={locale} currency={currency} fx={fx} onOpen={goListing} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Listing detail
// ---------------------------------------------------------------------------
function ListingView({ t, locale, currency, fx, refCode, setView, goListing, auth, setAuthModal, setReportModal }) {
  const [l, setL] = useState(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [reveal, setReveal] = useState(null);
  const [revealErr, setRevealErr] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    setL(null);
    api(`listings/${refCode}`).then(r => r.json()).then(d => { setL(d); setPhotoIdx(0); setReveal(null); }).catch(() => {});
  }, [refCode]);

  const doReveal = async () => {
    setRevealErr('');
    if (!auth.signedIn) { setAuthModal(true); return; }
    const res = await api('reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: refCode, signedIn: true, studentId: auth.studentId }) });
    if (res.status === 429) { setRevealErr(t('contact.limit')); return; }
    if (!res.ok) { setRevealErr(t('contact.limit')); return; }
    setReveal(await res.json());
  };

  if (!l || l.error) return <div className="container py-20 text-center text-slate-400">{t('common.loading')}</div>;

  const title = locale === 'tr' ? l.title_tr : l.title_en;
  const desc = locale === 'tr' ? l.description_tr : l.description_en;
  const pi = l.price_index;
  const totalFirstMonth = l.price.currency === l.deposit.currency
    ? { amount: l.price.amount + l.deposit.amount, currency: l.price.currency } : null;
  const daysConfirmed = Math.floor((Date.now() - new Date(l.last_confirmed_available_at)) / 86400000);

  return (
    <div className="container py-6">
      <button onClick={() => setView({ name: 'search', filters: {} })} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#0a4d68] mb-4">
        <ChevronLeft className="h-4 w-4" /> {t('listing.back')}
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-8">
        {/* Left */}
        <div>
          {/* Gallery */}
          <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
            <div className="relative aspect-[16/10] bg-slate-100">
              <img src={l.photos[photoIdx]} alt={title} className="h-full w-full object-cover" />
              <div className="absolute top-3 start-3 flex gap-2">
                {l.landlord_verified && <VerifiedPill t={t} />}
                {l.landlord_is_agency && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/90 text-slate-700 px-2.5 py-1 text-xs font-semibold">
                    <Building2 className="h-3.5 w-3.5" /> {t('listing.agency')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 p-2 overflow-x-auto">
              {l.photos.map((p, i) => (
                <button key={i} onClick={() => setPhotoIdx(i)}
                  className={`h-16 w-24 shrink-0 rounded-lg overflow-hidden border-2 ${i === photoIdx ? 'border-[#0a4d68]' : 'border-transparent'}`}>
                  <img src={p} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Title + key facts */}
          <div className="mt-5">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <MapPin className="h-4 w-4" /> {l.neighbourhood}, {l.city}
              <span className="text-slate-300">·</span>
              <span className="text-xs bg-slate-100 rounded px-1.5 py-0.5">{t('listing.ref')}: {l.reference_code}</span>
            </div>
            <h1 className="text-2xl font-bold text-[#0a3d54]">{title}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <PriceIndexPill pi={pi} t={t} listing={l} />
              {l.room_share && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#0a4d68]/10 text-[#0a4d68] px-2.5 py-1 text-xs font-semibold">
                  <Users className="h-3.5 w-3.5" /> {t('listing.shared')} · +{l.flatmates} {t('listing.flatmates')}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-[#0a4d68] text-white px-2.5 py-1 text-xs font-semibold">
                <Waypoints className="h-3.5 w-3.5" /> {l.walking_minutes} dk {t('listing.walk_to')} ({l.university?.short})
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] text-[#15803d] px-2.5 py-1 text-xs font-medium">
                <Clock className="h-3.5 w-3.5" /> {daysConfirmed} {t('listing.confirmed')}
              </span>
            </div>
          </div>

          {/* Facts grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {[
              [BedDouble, l.property_type === 'room' ? t('listing.private_room') : (l.bedrooms > 0 ? `${l.bedrooms} ${t('listing.bedrooms_n')}` : t('ptype.studio'))],
              [Bath, `${l.bathrooms} ${t('listing.bathrooms_n')}`],
              [Maximize, `${l.size_sqm} m²`],
              [Sofa, l.furnished ? t('listing.furnished_yes') : t('listing.furnished_no')],
            ].map(([Icon, label], i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-2">
                <Icon className="h-5 w-5 text-[#0a4d68]" />
                <span className="text-sm text-slate-700">{label}</span>
              </div>
            ))}
          </div>

          {/* Description with machine-translation note (RU/FR/AR handled later; TR/EN native) */}
          <div className="mt-6">
            <h2 className="font-bold text-[#0a3d54] mb-2">{t('listing.description')}</h2>
            <p className="text-slate-600 leading-relaxed whitespace-pre-line">{desc}</p>
          </div>

          {/* Amenities */}
          <div className="mt-6">
            <h2 className="font-bold text-[#0a3d54] mb-3">{t('listing.amenities')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {l.amenities.map(a => {
                const Icon = AMENITY[a]?.icon || Check;
                return (
                  <div key={a} className="flex items-center gap-2 text-sm text-slate-600">
                    <div className="h-8 w-8 rounded-lg bg-[#e8f2f6] flex items-center justify-center">
                      <Icon className="h-4 w-4 text-[#0a4d68]" />
                    </div>
                    {AMENITY[a] ? AMENITY[a][locale] : a}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Location */}
          <div className="mt-6">
            <h2 className="font-bold text-[#0a3d54] mb-2">{t('listing.location')}</h2>
            <MapCircle l={l} t={t} />
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> {t('listing.approx_note')}</p>
          </div>

          {/* Price history */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-bold text-[#0a3d54] mb-2">{t('priceindex.history')}</h2>
            <PriceHistoryChart history={l.price_history} currency={currency} fx={fx} locale={locale} t={t} />
          </div>

          {/* Report */}
          <button onClick={() => setReportModal(l.reference_code)} className="mt-5 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-500">
            <Flag className="h-4 w-4" /> {t('listing.report')}
          </button>
        </div>

        {/* Right sticky sidebar */}
        <div className="lg:sticky lg:top-24 h-fit space-y-4">
          {/* Price + cost breakdown */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <PriceDisplay price={l.price} currency={currency} fx={fx} locale={locale} t={t} size="lg" />
            <div className="mt-4 border-t border-slate-100 pt-4 space-y-2 text-sm">
              <div className="font-semibold text-[#0a3d54] mb-1">{t('listing.cost_breakdown')}</div>
              <Row label={t('listing.rent')} value={<PriceInline price={l.price} currency={currency} fx={fx} locale={locale} />} />
              <Row label={t('listing.deposit')} value={<PriceInline price={l.deposit} currency={currency} fx={fx} locale={locale} />} />
              <Row label={t('listing.bills')} value={l.bills_included ? (locale === 'tr' ? 'Dahil' : 'Included') : (l.bills_note || '—')} muted />
              <Row label={t('listing.agency_fee')} value={l.agency_fee_note || '—'} muted />
              {totalFirstMonth && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 mt-1">
                  <span className="font-semibold text-[#0a3d54]">{t('listing.total_first_month')}</span>
                  <span className="font-bold text-[#0a3d54]"><PriceInline price={totalFirstMonth} currency={currency} fx={fx} locale={locale} /></span>
                </div>
              )}
            </div>
            {pi?.enough && (
              <div className="mt-4 rounded-xl bg-[#f8fafc] border border-slate-100 p-3">
                <div className="text-xs font-semibold text-slate-500 mb-1">{t('priceindex.title')}</div>
                <div className="text-sm text-slate-700">
                  {pi.position === 'below' && <span className="text-[#15803d] font-semibold">{t('priceindex.below', { n: pi.pct })}</span>}
                  {pi.position === 'above' && <span className="text-amber-700 font-semibold">{t('priceindex.above', { n: pi.pct })}</span>}
                  {pi.position === 'at' && <span className="font-semibold">{t('priceindex.at')}</span>}
                  {' '}
                  {t('priceindex.context', { uni: l.university?.short, beds: l.bedrooms > 0 ? `${l.bedrooms}+` : t('ptype.studio'), type: t(`ptype.${l.property_type}`).toLowerCase() })}
                  <span className="text-slate-400"> · n={pi.sample_size}</span>
                </div>
              </div>
            )}
          </div>

          {/* Contact gating */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold text-[#0a3d54] mb-1 flex items-center gap-2">
              <Phone className="h-4 w-4" /> {t('contact.title')}
            </h3>
            {reveal ? (
              <div className="mt-3 space-y-2">
                <div className="rounded-xl bg-[#e8f2f6] p-3 text-center">
                  <div className="text-xs text-slate-500">{l.landlord_name}</div>
                  <div className="text-lg font-bold text-[#0a3d54]" dir="ltr">{reveal.phone}</div>
                </div>
                <a href={reveal.whatsapp_url} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-2 h-11 rounded-xl bg-[#25D366] text-white font-semibold">
                  <MessageCircle className="h-5 w-5" /> {t('contact.whatsapp')}
                </a>
                <a href={`tel:${reveal.phone.replace(/\s/g, '')}`}
                  className="flex items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 text-slate-700 font-semibold">
                  <Phone className="h-4 w-4" /> {t('contact.call')}
                </a>
              </div>
            ) : (
              <div className="mt-2">
                <div className="relative rounded-xl bg-slate-50 border border-slate-200 p-4 mb-3 overflow-hidden">
                  <div className="blur-sm select-none text-lg font-bold text-slate-400" dir="ltr">+90 5•• ••• •• ••</div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-3">{t('contact.gated_desc')}</p>
                {revealErr && <p className="text-xs text-red-600 mb-2">{revealErr}</p>}
                <button onClick={doReveal}
                  className="w-full h-11 rounded-xl bg-[#0a4d68] hover:bg-[#08415c] text-white font-semibold">
                  {auth.signedIn ? t('contact.reveal') : t('contact.signin_to_reveal')}
                </button>
              </div>
            )}
          </div>

          <ScamBanner t={t} compact />
        </div>
      </div>

      {/* Similar */}
      {l.similar?.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold text-[#0a3d54] mb-5">{t('listing.similar')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {l.similar.map(s => <ListingCard key={s.id} l={s} t={t} locale={locale} currency={currency} fx={fx} onOpen={goListing} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, muted }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={muted ? 'text-slate-500 text-right text-xs' : 'text-slate-800 font-medium text-right'}>{value}</span>
    </div>
  );
}
function PriceInline({ price, currency, fx, locale }) {
  const same = price.currency === currency;
  if (same) return <>{fmtMoney(price.amount, price.currency, locale)}</>;
  return <>≈ {fmtMoney(convertMoney(price.amount, price.currency, currency, fx), currency, locale)}</>;
}

// ---------------------------------------------------------------------------
// University landing
// ---------------------------------------------------------------------------
function UniversityView({ t, locale, currency, fx, slug, goListing }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    api(`universities/${slug}`).then(r => r.json()).then(setData).catch(() => {});
  }, [slug]);
  if (!data || data.error) return <div className="container py-20 text-center text-slate-400">{t('common.loading')}</div>;
  const u = data.university;
  return (
    <div>
      <section className="bg-[#0a4d68] text-white">
        <div className="container py-12">
          <span className="text-xs font-semibold bg-white/15 rounded px-2 py-0.5">{u.short}</span>
          <h1 className="text-3xl font-bold mt-3">{locale === 'tr' ? u.name_tr : u.name_en}</h1>
          <div className="flex items-center gap-4 mt-3 text-white/80 text-sm">
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {u.city}</span>
            <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" /> {data.listings_count} {t('universities.listings_count')}</span>
          </div>
        </div>
      </section>

      {/* Median rent by type (from price index, GBP) */}
      {data.price_index.length > 0 && (
        <section className="container py-8">
          <h2 className="font-bold text-[#0a3d54] mb-4">{t('universities.median_rent')} (GBP)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.price_index.map((pi, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-500">{t(`ptype.${pi.property_type}`)} {pi.bedrooms > 0 ? `· ${pi.bedrooms}+` : ''}</div>
                {pi.sample_size >= 5 ? (
                  <>
                    <div className="text-xl font-bold text-[#0a4d68] mt-1">£{pi.median_gbp}</div>
                    <div className="text-[11px] text-slate-400">£{pi.p25_gbp}–£{pi.p75_gbp} · n={pi.sample_size}</div>
                  </>
                ) : (
                  <div className="text-sm text-slate-400 mt-1">{t('priceindex.not_enough')}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="container pb-16">
        <h2 className="font-bold text-[#0a3d54] mb-4">{t('nav.search')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {data.listings.map(l => <ListingCard key={l.id} l={l} t={t} locale={locale} currency={currency} fx={fx} onOpen={goListing} />)}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Static pages
// ---------------------------------------------------------------------------
function StaticView({ t, locale, kind }) {
  const content = {
    scam: {
      title: t('scam.guide_title'),
      body: locale === 'tr' ? [
        'Evi görmeden asla para göndermeyin. Mümkünse yerinde veya canlı görüntülü tur isteyin.',
        'Fiyat piyasanın çok altındaysa dikkatli olun — klasik bir tuzaktır. Adil fiyat göstergemiz bunu işaretler.',
        'Ödemeyi platform dışına yönlendiren, "kapora yatır anahtarı al" diyen ilanlara güvenmeyin.',
        'Doğrulanmış ilan sahiplerini tercih edin (yeşil rozet).',
        'Kıbrıs Öğrenci hiçbir zaman kira veya depozito tahsil etmez.',
      ] : [
        'Never send money before seeing the property. Ask for an in-person visit or a live video tour.',
        'Be cautious when the price is far below the market — the classic bait. Our fair price indicator flags this.',
        'Do not trust listings that push payment off-platform or say "pay a deposit to get the keys".',
        'Prefer verified landlords (green badge).',
        'Kıbrıs Öğrenci never collects rent or deposits.',
      ],
    },
    how: {
      title: t('trust.how_title'),
      body: t('trust.how_items').map(i => `${i.t} — ${i.d}`),
    },
  }[kind];
  return (
    <div className="container py-12 max-w-3xl">
      <h1 className="text-3xl font-bold text-[#0a3d54] mb-6">{content.title}</h1>
      {kind === 'scam' && <div className="mb-6"><ScamBanner t={t} /></div>}
      <ul className="space-y-4">
        {content.body.map((b, i) => (
          <li key={i} className="flex gap-3">
            <div className="h-6 w-6 rounded-full bg-[#e8f2f6] text-[#0a4d68] flex items-center justify-center shrink-0 text-sm font-bold">{i + 1}</div>
            <p className="text-slate-600 leading-relaxed">{b}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
function Footer({ t, config, setView, goUniversity }) {
  return (
    <footer className="bg-[#0a3d54] text-white/80 mt-8">
      <div className="container py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5 mb-3">
            <img src="/logo.png" alt={t('brand')} className="h-11 w-11 object-contain bg-white rounded-lg p-1" />
            <span className="font-bold text-white text-lg">{t('brand')}</span>
          </div>
          <p className="text-sm leading-relaxed max-w-md">{t('footer.about')}</p>
        </div>
        <div>
          <div className="font-semibold text-white mb-3">{t('nav.search')}</div>
          <ul className="space-y-2 text-sm">
            <li><button onClick={() => setView({ name: 'search', filters: {} })} className="hover:text-white">{t('nav.search')}</button></li>
            <li><button onClick={() => setView({ name: 'how' })} className="hover:text-white">{t('nav.how')}</button></li>
            <li><button onClick={() => setView({ name: 'scam' })} className="hover:text-white">{t('nav.scam')}</button></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-white mb-3">{t('universities.title')}</div>
          <ul className="space-y-2 text-sm">
            {(config?.universities || []).slice(0, 5).map(u => (
              <li key={u.id}><button onClick={() => goUniversity(u.slug)} className="hover:text-white">{u.short}</button></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
        © {new Date().getFullYear()} {t('brand')}. {t('footer.rights')}
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
function AuthModal({ t, onClose, setAuth }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signIn = () => {
    setAuth({ signedIn: true, studentId: `demo-${Math.random().toString(36).slice(2, 8)}`, email: email || 'student@demo' });
    onClose();
  };
  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-bold text-[#0a3d54]">{t('auth.title')}</h2>
      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">{t('auth.note')}</p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500">{t('auth.email')}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm mt-1 outline-none focus:ring-2 focus:ring-[#0a4d68]/30" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">{t('auth.password')}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm mt-1 outline-none focus:ring-2 focus:ring-[#0a4d68]/30" />
        </div>
        <button onClick={signIn} className="w-full h-11 rounded-xl bg-[#0a4d68] text-white font-semibold">{t('auth.signin')}</button>
        <button onClick={signIn} className="w-full h-11 rounded-xl border border-slate-200 text-slate-700 font-semibold">{t('auth.as_student')}</button>
      </div>
    </Overlay>
  );
}

function ReportModal({ t, refCode, onClose }) {
  const [reason, setReason] = useState('scam');
  const [detail, setDetail] = useState('');
  const [done, setDone] = useState(false);
  const submit = async () => {
    await api('reports', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: refCode, reason, detail }) }).catch(() => {});
    setDone(true);
  };
  return (
    <Overlay onClose={onClose}>
      {done ? (
        <div className="text-center py-4">
          <div className="h-12 w-12 rounded-full bg-[#dcfce7] text-[#15803d] flex items-center justify-center mx-auto mb-3"><Check className="h-6 w-6" /></div>
          <p className="text-slate-700">{t('report.thanks')}</p>
          <button onClick={onClose} className="mt-4 h-10 px-5 rounded-xl bg-[#0a4d68] text-white font-semibold">{t('auth.close')}</button>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-bold text-[#0a3d54] flex items-center gap-2"><Flag className="h-5 w-5" /> {t('report.title')}</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">{t('report.reason')}</label>
              <select value={reason} onChange={e => setReason(e.target.value)}
                className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm mt-1 outline-none">
                {Object.keys(messages.tr.report.reasons).map(k => <option key={k} value={k}>{t(`report.reasons.${k}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">{t('report.detail')}</label>
              <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm mt-1 outline-none focus:ring-2 focus:ring-[#0a4d68]/30" />
            </div>
            <button onClick={submit} className="w-full h-11 rounded-xl bg-[#0a4d68] text-white font-semibold">{t('report.submit')}</button>
          </div>
        </>
      )}
    </Overlay>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 end-4 text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        {children}
      </div>
    </div>
  );
}
