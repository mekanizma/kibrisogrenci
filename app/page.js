'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import {
  Search, MapPin, ShieldCheck, BadgeCheck, Wifi, Snowflake, Car, Waves,
  Dumbbell, ChevronLeft, Menu, TrendingDown, TrendingUp,
  Phone, MessageCircle, X, Check, GraduationCap, Building2, Info, Clock,
  BedDouble, Bath, Maximize, Flag, Lock, Sofa, Trees, ShieldAlert, Waypoints, Users, Heart, SlidersHorizontal,
  ArrowRight, Sparkles, Footprints, ChevronRight, ChevronDown, Eye, EyeOff, Mail, User,
} from 'lucide-react';
import { tFor, LOCALES, LOCALE_LABEL, isRTL, listingLang, isMachineTranslated } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/client';
import { api, getAccessToken, refreshSessionIntoAuth, signOutEverywhere, setAccessToken } from '@/lib/api-client';
import { MOCK_PHOTOS } from '@/lib/mock-featured';
import {
  distanceToListing,
  formatDistance,
  getGeoPref,
  loadStoredGeo,
  requestUserLocation,
  setGeoPref,
} from '@/lib/geo-client';
import { KKTC_CITIES } from '@/lib/universities';

const DashboardView = dynamic(
  () => import('@/components/panels').then((m) => m.DashboardView),
  { ssr: false, loading: () => <div className="container py-16 text-center text-slate-400 text-sm">Yükleniyor…</div> },
);
const AdminView = dynamic(
  () => import('@/components/panels').then((m) => m.AdminView),
  { ssr: false, loading: () => <div className="container py-16 text-center text-slate-400 text-sm">Yükleniyor…</div> },
);
const WhatsAppView = dynamic(
  () => import('@/components/panels').then((m) => m.WhatsAppView),
  { ssr: false, loading: () => <div className="container py-16 text-center text-slate-400 text-sm">Yükleniyor…</div> },
);
const PriceHistoryChart = dynamic(() => import('@/components/PriceHistoryChart'), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-xl bg-slate-100" />,
});
const ListingMap = dynamic(() => import('@/components/ListingMap'), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-xl bg-slate-100 border border-slate-200" />,
});
const ProfileView = dynamic(() => import('@/components/ProfileView'), {
  ssr: false,
  loading: () => <div className="container py-16 text-center text-slate-400 text-sm">Yükleniyor…</div>,
});
const MessagesView = dynamic(() => import('@/components/MessagesView'), {
  ssr: false,
  loading: () => <div className="container py-16 text-center text-slate-400 text-sm">Yükleniyor…</div>,
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const SYMBOL = { TRY: '₺', GBP: '£', USD: '$', EUR: '€' };
const LOCALE_TAG = { tr: 'tr-TR', en: 'en-GB' };
const ALLOW_DEMO_AUTH = process.env.NEXT_PUBLIC_ALLOW_DEMO_AUTH === 'true';

function listingPhoto(l, i = 0) {
  const p = Array.isArray(l?.photos) ? l.photos[i] : null;
  if (p && typeof p === 'string') {
    if (p.startsWith('/api/media')) return p;
    if (/^https?:\/\//i.test(p) && !p.includes('logo')) return p;
  }
  const idx = Math.abs(String(l?.id || l?.reference_code || i).length + i) % MOCK_PHOTOS.length;
  return MOCK_PHOTOS[idx];
}

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

const REPORT_REASONS = ['scam', 'fake', 'unavailable', 'offensive', 'other'];

function ListingCard({ l, t, locale, currency, fx, onOpen, userLoc }) {
  const photo = listingPhoto(l, 0);
  const same = l.price?.currency === currency;
  const priceLabel = same
    ? fmtMoney(l.price.amount, l.price.currency, locale)
    : `≈ ${fmtMoney(convertMoney(l.price.amount, l.price.currency, currency, fx), currency, locale)}`;
  const [imgSrc, setImgSrc] = useState(photo);
  const title = locale === 'tr' ? l.title_tr : l.title_en;
  const bedsLabel = l.property_type === 'room'
    ? t('listing.private_room')
    : (l.bedrooms > 0 ? `${l.bedrooms} ${t('listing.bedrooms_n')}` : t('ptype.studio'));
  const userDistM = l.distance_from_user_m ?? distanceToListing(userLoc, l);
  const nearLabel = userDistM != null
    ? `${formatDistance(userDistM, locale)} ${t('geo.from_you')}`
    : null;
  const campusLabel = l.walking_minutes != null
    ? `${l.walking_minutes} ${locale === 'tr' ? 'dk' : 'min'} ${t('geo.to_campus')}`
    : (l.distance_m != null
      ? `${formatDistance(Number(l.distance_m), locale)} ${t('geo.to_campus')}`
      : null);
  const walkLabel = [nearLabel, campusLabel].filter(Boolean).join(' · ') || null;

  return (
    <button
      type="button"
      onClick={() => onOpen(l.reference_code)}
      className="ko-uicard group"
    >
      <section className="ko-uicard-media">
        <Image
          src={imgSrc}
          alt={title || ''}
          fill
          sizes="(max-width:640px) 90vw, (max-width:1024px) 45vw, 320px"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
          unoptimized={typeof imgSrc === 'string' && imgSrc.startsWith('/api/media')}
          onError={() => setImgSrc(MOCK_PHOTOS[0])}
        />
        <div className="ko-uicard-filter" aria-hidden />
        <div className="ko-uicard-overlay">
          <div className="ko-uicard-overlay-left">
            {l.landlord_verified && <VerifiedPill t={t} small />}
            {l.landlord_is_agency && (
              <span className="ko-chip bg-white/90 text-slate-700 shadow-sm">
                <Building2 className="h-3 w-3" /> {t('listing.agency')}
              </span>
            )}
          </div>
          <div className="ko-uicard-overlay-right">
            <div className="ko-uicard-location">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{l.city || l.neighbourhood || '—'}</span>
            </div>
            <p className="ko-uicard-temp">{priceLabel}<span>{t('listing.per_month')}</span></p>
            {walkLabel && (
              <p className="ko-uicard-date">
                <Waypoints className="inline h-3 w-3 me-1 align-[-2px]" />
                {walkLabel}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="ko-uicard-body">
        <div className="ko-uicard-row">
          <p className="ko-uicard-row-label">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#0a4d68]" />
            <span className="truncate">{[l.neighbourhood, l.city].filter(Boolean).join(', ')}</span>
          </p>
          {l.price_index ? (
            <span className="ko-uicard-row-value shrink-0">
              <PriceIndexPill pi={l.price_index} t={t} listing={l} />
            </span>
          ) : null}
        </div>
        <div className="ko-uicard-sep" />
        <div className="ko-uicard-row">
          <p className="ko-uicard-title">{title}</p>
        </div>
        <div className="ko-uicard-sep" />
        <div className="ko-uicard-row">
          <p className="ko-uicard-row-label">{t(`ptype.${l.property_type}`)}</p>
          <p className="ko-uicard-row-value">{bedsLabel}</p>
        </div>
        {l.size_sqm ? (
          <>
            <div className="ko-uicard-sep" />
            <div className="ko-uicard-row">
              <p className="ko-uicard-row-label">{t('listing.size')}</p>
              <p className="ko-uicard-row-value">{l.size_sqm} m²</p>
            </div>
          </>
        ) : null}
        {l.room_share && (
          <>
            <div className="ko-uicard-sep" />
            <div className="ko-uicard-row">
              <p className="ko-uicard-row-label">{t('listing.shared')}</p>
              <p className="ko-uicard-row-value">+{l.flatmates} {t('listing.flatmates')}</p>
            </div>
          </>
        )}
      </section>
    </button>
  );
}

function ScamBanner({ t, compact }) {
  return (
    <div className={`rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/40 ${compact ? 'p-3' : 'p-4 sm:p-5'} flex gap-3`}>
      <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-100/80 flex items-center justify-center">
        <ShieldAlert className="h-5 w-5 text-amber-700" />
      </div>
      <div>
        <div className="font-semibold text-amber-950 text-sm">{t('scam.banner_title')}</div>
        <p className="text-sm text-amber-900/80 mt-0.5 leading-relaxed">{t('scam.banner')}</p>
      </div>
    </div>
  );
}

function MapCircle({ l, t }) {
  const lat = l?.approx_lat;
  const lng = l?.approx_lng;
  const label = `${l?.neighbourhood || ''}${l?.neighbourhood && l?.city ? ', ' : ''}${l?.city || ''} · ${t('listing.approx_location')}`;
  return (
    <ListingMap lat={lat} lng={lng} label={label} radiusM={300} />
  );
}

function LocationBanner({ t, userLoc, locating, onAllow, onDismiss, compact }) {
  if (userLoc) {
    if (compact) return null;
    return (
      <div className="border-b border-emerald-100 bg-emerald-50/90 px-3 py-2 text-center text-xs font-medium text-emerald-900 sm:text-sm">
        <MapPin className="inline h-3.5 w-3.5 me-1 align-[-2px]" />
        {t('geo.active')}
      </div>
    );
  }
  return (
    <div className="border-b border-[#0a4d68]/15 bg-[linear-gradient(90deg,#e8f4f7,#f6f4f0)] px-3 py-3 sm:px-4">
      <div className="container flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0a4d68]/10 text-[#0a4d68]">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#0a3d54]">{t('geo.banner_title')}</div>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600 sm:text-sm">{t('geo.banner_body')}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 sm:flex-none"
          >
            {t('geo.later')}
          </button>
          <button
            type="button"
            disabled={locating}
            onClick={onAllow}
            className="h-10 flex-1 rounded-xl bg-[#0a4d68] px-4 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none"
          >
            {locating ? t('geo.locating') : t('geo.allow')}
          </button>
        </div>
      </div>
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
  const [authModal, setAuthModal] = useState(false); // false | 'signin' | 'signup'
  const [reportModal, setReportModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userLoc, setUserLoc] = useState(null);
  const [geoBanner, setGeoBanner] = useState(false);
  const [locating, setLocating] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const t = useMemo(() => tFor(locale), [locale]);
  const fx = config?.fx_to_gbp || { TRY: 0.0234, USD: 0.79, EUR: 0.855, GBP: 1 };

  useEffect(() => {
    const stored = loadStoredGeo();
    if (stored) {
      setUserLoc(stored);
      return;
    }
    const pref = getGeoPref();
    if (pref !== 'denied' && pref !== 'dismissed' && pref !== 'granted') {
      setGeoBanner(true);
    }
  }, []);

  const allowLocation = useCallback(async () => {
    setLocating(true);
    try {
      const geo = await requestUserLocation();
      setUserLoc(geo);
      setGeoBanner(false);
      return geo;
    } catch (err) {
      setGeoBanner(false);
      throw err;
    } finally {
      setLocating(false);
    }
  }, []);

  const dismissLocation = useCallback(() => {
    setGeoPref('dismissed');
    setGeoBanner(false);
  }, []);

  useEffect(() => {
    api('config').then(r => r.json()).then(setConfig).catch(() => {});
    refreshSessionIntoAuth(setAuth);
    // Clear expired email-link error from URL so it doesn't look like a login loop
    if (typeof window !== 'undefined' && window.location.search.includes('error=')) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('error_code') === 'otp_expired' || url.searchParams.get('error') === 'access_denied') {
        url.search = '';
        window.history.replaceState({}, '', url.pathname);
      }
    }
    const supabase = createClient();
    if (!supabase) return undefined;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAccessToken(session.access_token);
        setAuth({
          signedIn: true,
          studentId: session.user.id,
          email: session.user.email,
          role: session.user.app_metadata?.role || session.user.user_metadata?.role || 'landlord',
          accessToken: session.access_token,
        });
      } else {
        setAccessToken(null);
        setAuth({ signedIn: false });
      }
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRTL(locale) ? 'rtl' : 'ltr';
    window.scrollTo(0, 0);
  }, [view, locale]);

  const refreshUnread = useCallback(async () => {
    if (!auth?.signedIn) {
      setUnreadMessages(0);
      return;
    }
    try {
      const token = getAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await api('messages/unread', { headers });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setUnreadMessages(Number(data.count) || 0);
    } catch {
      /* ignore */
    }
  }, [auth?.signedIn]);

  useEffect(() => {
    if (!auth?.signedIn) {
      setUnreadMessages(0);
      return undefined;
    }
    refreshUnread();
    const id = setInterval(refreshUnread, 12000);
    return () => clearInterval(id);
  }, [auth?.signedIn, refreshUnread, view.name]);

  const goSearch = useCallback((filters = {}) => setView({ name: 'search', filters }), []);
  const goListing = useCallback((ref) => setView({ name: 'listing', ref }), []);
  const goUniversity = useCallback((slug) => setView({ name: 'university', slug }), []);

  const shared = { t, locale, currency, fx, config, goSearch, goListing, goUniversity,
    auth, setAuth, setAuthModal, setReportModal, userLoc, requestLocation: allowLocation };

  return (
    <div className="min-h-screen text-slate-800">
      <Header {...shared} locale={locale} setLocale={setLocale} currency={currency} setCurrency={setCurrency}
        setView={setView} menuOpen={menuOpen} setMenuOpen={setMenuOpen} unreadMessages={unreadMessages} />

      {config?.mock && (
        <div className="bg-[#08304a] text-white/90 text-center text-xs py-1.5 px-4 tracking-wide">
          {t('demo_banner')}
        </div>
      )}

      {geoBanner && (
        <LocationBanner
          t={t}
          userLoc={null}
          locating={locating}
          onAllow={allowLocation}
          onDismiss={dismissLocation}
        />
      )}

      <main className="pb-2">
        {view.name === 'home' && <HomeView {...shared} setView={setView} />}
        {view.name === 'search' && <SearchView {...shared} initialFilters={view.filters} />}
        {view.name === 'listing' && <ListingView {...shared} refCode={view.ref} setView={setView} />}
        {view.name === 'university' && <UniversityView {...shared} slug={view.slug} />}
        {view.name === 'scam' && <StaticView {...shared} kind="scam" />}
        {view.name === 'how' && <StaticView {...shared} kind="how" />}
        {view.name === 'dashboard' && <DashboardView t={t} locale={locale} config={config} auth={auth} requestLocation={allowLocation} userLoc={userLoc} />}
        {view.name === 'admin' && <AdminView t={t} locale={locale} auth={auth} />}
        {view.name === 'whatsapp' && <WhatsAppView t={t} locale={locale} />}
        {view.name === 'saved' && <SavedView {...shared} />}
        {view.name === 'messages' && (
          <MessagesView
            t={t}
            locale={locale}
            auth={auth}
            setAuthModal={setAuthModal}
            setView={setView}
            initialId={view.id || null}
            onUnreadChange={refreshUnread}
          />
        )}
        {view.name === 'profile' && (
          <ProfileView
            t={t}
            locale={locale}
            currency={currency}
            setLocale={setLocale}
            setCurrency={setCurrency}
            config={config}
            auth={auth}
            setAuthModal={setAuthModal}
          />
        )}
      </main>

      <Footer t={t} config={config} setView={setView} goUniversity={goUniversity} />

      {authModal && (
        <AuthModal
          t={t}
          locale={locale}
          initialMode={authModal === 'signin' || authModal === 'signup' ? authModal : 'signin'}
          onClose={() => setAuthModal(false)}
          setAuth={setAuth}
        />
      )}
      {reportModal && <ReportModal t={t} refCode={reportModal} onClose={() => setReportModal(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand mark — uses provided logo artwork
// ---------------------------------------------------------------------------
function BrandMark({ className = 'h-10 w-auto', title = 'Kıbrıs Öğrenci', variant = 'full' }) {
  const src = variant === 'icon' ? '/logo-icon.png' : '/logo-sm.png';
  return (
    <img
      src={src}
      alt={title}
      width={variant === 'icon' ? 48 : 260}
      height={variant === 'icon' ? 48 : 120}
      className={`${className} shrink-0 object-contain`}
      draggable={false}
      decoding="async"
      fetchPriority={variant === 'full' ? 'high' : 'auto'}
    />
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function Header({ t, locale, setLocale, currency, setCurrency, setView, auth, setAuth, setAuthModal, config, menuOpen, setMenuOpen, unreadMessages = 0 }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const guideRef = useRef(null);
  const go = (v) => { setView(v); setMenuOpen(false); setGuideOpen(false); };
  const unreadBadge = unreadMessages > 0 ? (
    <span className="ms-1.5 inline-flex min-w-[1.125rem] h-[1.125rem] items-center justify-center rounded-full bg-[#c45c26] px-1 text-[10px] font-bold leading-none text-white tabular-nums">
      {unreadMessages > 9 ? '9+' : unreadMessages}
    </span>
  ) : null;
  const navItems = [
    ['search', () => go({ name: 'search', filters: {} })],
    ['dashboard', () => go({ name: 'dashboard' })],
    ...(auth.signedIn ? [['messages', () => go({ name: 'messages' })], ['saved', () => go({ name: 'saved' })]] : []),
    ...(auth.role === 'admin' ? [['admin', () => go({ name: 'admin' })]] : []),
    ...((config?.mock || process.env.NEXT_PUBLIC_SHOW_WHATSAPP_DEMO === 'true') ? [['whatsapp', () => go({ name: 'whatsapp' })]] : []),
  ];
  const guideItems = [
    ['how', () => go({ name: 'how' })],
    ['scam', () => go({ name: 'scam' })],
  ];
  const mobileNavItems = [
    ['search', () => go({ name: 'search', filters: {} })],
    ...guideItems,
    ['dashboard', () => go({ name: 'dashboard' })],
    ...(auth.signedIn ? [['messages', () => go({ name: 'messages' })], ['saved', () => go({ name: 'saved' })], ['profile', () => go({ name: 'profile' })]] : []),
    ...(auth.role === 'admin' ? [['admin', () => go({ name: 'admin' })]] : []),
    ...((config?.mock || process.env.NEXT_PUBLIC_SHOW_WHATSAPP_DEMO === 'true') ? [['whatsapp', () => go({ name: 'whatsapp' })]] : []),
  ];

  useEffect(() => {
    if (!guideOpen) return undefined;
    const onDoc = (e) => {
      if (guideRef.current && !guideRef.current.contains(e.target)) setGuideOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setGuideOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [guideOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-[#0a3d54]/10 bg-[#f6f4f0]/95 backdrop-blur-xl">
      <div className="container flex items-center justify-between h-16 sm:h-[4.25rem] gap-2">
        <button
          type="button"
          onClick={() => go({ name: 'home' })}
          className="flex items-center shrink-0 min-w-0 group cursor-pointer"
          aria-label={t('brand')}
        >
          <BrandMark
            title={t('brand')}
            className="h-11 sm:h-12 w-auto max-w-[min(52vw,220px)] sm:max-w-[260px] transition-transform duration-300 group-hover:scale-[1.02] group-active:scale-[0.98]"
          />
        </button>

        <nav className="hidden lg:flex items-center gap-1 text-sm font-medium text-slate-600">
          {navItems.map(([k, fn]) => (
            <button type="button" key={k} onClick={fn} className="inline-flex items-center px-3 py-2 rounded-lg hover:bg-[var(--ko-mist)] hover:text-[#0a4d68] whitespace-nowrap transition-colors cursor-pointer">
              {t(`nav.${k}`)}
              {k === 'messages' ? unreadBadge : null}
            </button>
          ))}
          <div className="relative" ref={guideRef}>
            <button
              type="button"
              onClick={() => setGuideOpen((o) => !o)}
              aria-expanded={guideOpen}
              aria-haspopup="menu"
              className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${guideOpen ? 'bg-[var(--ko-mist)] text-[#0a4d68]' : 'hover:bg-[var(--ko-mist)] hover:text-[#0a4d68]'}`}
            >
              {t('nav.guides')}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
            </button>
            {guideOpen && (
              <div
                role="menu"
                className="absolute top-full start-0 mt-1.5 min-w-[220px] rounded-xl border border-slate-200/90 bg-white py-1.5 shadow-lg shadow-black/10 z-50"
              >
                {guideItems.map(([k, fn]) => (
                  <button
                    key={k}
                    type="button"
                    role="menuitem"
                    onClick={fn}
                    className="w-full text-start px-3.5 py-2.5 text-sm text-slate-700 hover:bg-[var(--ko-mist)] hover:text-[#0a4d68] transition-colors"
                  >
                    {t(`nav.${k}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-1.5 shrink-0">
          <select value={currency} onChange={e => setCurrency(e.target.value)}
            className="h-9 rounded-xl border border-slate-200/80 bg-white/90 px-2 text-xs font-medium text-slate-600 focus:ring-2 focus:ring-[#0a4d68]/25 outline-none cursor-pointer">
            {(config?.currencies || ['TRY', 'GBP', 'USD', 'EUR']).map(c => <option key={c} value={c}>{SYMBOL[c]} {c}</option>)}
          </select>
          <div className="hidden md:flex rounded-xl border border-slate-200/80 overflow-hidden bg-white/90">
            {LOCALES.map(l => (
              <button type="button" key={l} onClick={() => setLocale(l)}
                className={`px-2.5 h-9 text-xs font-semibold transition-colors cursor-pointer ${locale === l ? 'bg-[#0a4d68] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {LOCALE_LABEL[l]}
              </button>
            ))}
          </div>
          <select value={locale} onChange={e => setLocale(e.target.value)}
            className="md:hidden h-9 rounded-xl border border-slate-200/80 bg-white/90 px-1.5 text-xs font-semibold text-slate-600 outline-none">
            {LOCALES.map(l => <option key={l} value={l}>{LOCALE_LABEL[l]}</option>)}
          </select>
          {auth.signedIn ? (
            <>
              <button type="button" onClick={() => go({ name: 'profile' })}
                className="hidden md:inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-[var(--ko-mist)] cursor-pointer">
                {t('nav.profile')}
              </button>
              <button type="button" onClick={() => signOutEverywhere(setAuth)}
                className="hidden md:inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-[var(--ko-mist)] cursor-pointer">
                {t('nav.signout')}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setAuthModal('signin')}
              className="hidden md:inline-flex h-9 items-center rounded-xl bg-[#0a4d68] px-3.5 text-sm font-semibold text-white hover:bg-[#08415c] shadow-sm shadow-[#0a4d68]/20 cursor-pointer">
              {t('nav.signin')}
            </button>
          )}
          <button type="button" onClick={() => setMenuOpen(!menuOpen)} className="relative lg:hidden h-11 w-11 flex items-center justify-center rounded-2xl border border-slate-200/80 text-slate-600 bg-white/90 cursor-pointer" aria-label="Menu">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            {!menuOpen && unreadMessages > 0 && (
              <span className="absolute top-1.5 end-1.5 h-2.5 w-2.5 rounded-full bg-[#c45c26] ring-2 ring-[#f6f4f0]" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="lg:hidden border-t border-slate-200/70 bg-[#f6f4f0]/98 backdrop-blur-xl max-h-[calc(100dvh-4rem)] overflow-y-auto">
          <nav className="container py-3 pb-6 flex flex-col gap-1">
            {mobileNavItems.map(([k, fn]) => (
              <button type="button" key={k} onClick={fn} className="inline-flex items-center text-start min-h-12 py-3 px-3 rounded-2xl text-sm font-medium text-slate-700 hover:bg-white">
                {t(`nav.${k}`)}
                {k === 'messages' ? unreadBadge : null}
              </button>
            ))}
            {auth.signedIn ? (
              <button type="button" onClick={() => { signOutEverywhere(setAuth); setMenuOpen(false); }} className="text-start min-h-12 py-3 px-3 rounded-2xl text-sm font-medium text-slate-600 hover:bg-white">{t('nav.signout')}</button>
            ) : (
              <button type="button" onClick={() => { setAuthModal('signin'); setMenuOpen(false); }} className="mt-2 h-12 rounded-2xl bg-[#0a4d68] text-white font-semibold">{t('nav.signin')}</button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
function HomeView({ t, locale, currency, fx, config, goSearch, goListing, goUniversity, setView, userLoc }) {
  const [featured, setFeatured] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [uni, setUni] = useState('');
  const [budget, setBudget] = useState('');
  const [ptype, setPtype] = useState('');
  const [maxWalk, setMaxWalk] = useState('');
  const [maxDistanceM, setMaxDistanceM] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [uniOpen, setUniOpen] = useState(false);
  const [uniQ, setUniQ] = useState('');
  const [uniRegion, setUniRegion] = useState('');
  const uniPickerRef = useRef(null);

  useEffect(() => {
    setFeaturedLoading(true);
    const qs = new URLSearchParams({ featured: '1', limit: '6' });
    if (userLoc?.lat != null && userLoc?.lng != null) {
      qs.set('near_lat', String(userLoc.lat));
      qs.set('near_lng', String(userLoc.lng));
      qs.set('sort', 'near');
    }
    api(`listings?${qs}`)
      .then(r => r.json())
      .then(d => {
        setFeatured(d.items || []);
      })
      .catch(() => setFeatured([]))
      .finally(() => setFeaturedLoading(false));
  }, [userLoc?.lat, userLoc?.lng]);

  useEffect(() => {
    if (!uniOpen) return undefined;
    const onDoc = (e) => {
      if (uniPickerRef.current && !uniPickerRef.current.contains(e.target)) setUniOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setUniOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [uniOpen]);

  const stats = config?.stats;
  const unis = config?.universities || [];
  // Derive live fallbacks if config.stats is stale/missing
  const liveStats = {
    listings: stats?.listings ?? unis.reduce((n, u) => n + (u.listings_count || 0), 0),
    universities: stats?.universities ?? unis.length,
    verified_landlords: stats?.verified_landlords ?? 0,
    cities: stats?.cities ?? new Set(unis.map((u) => u.city).filter(Boolean)).size,
  };
  const CITY_ORDER = KKTC_CITIES;
  const unisByCity = (() => {
    const map = new Map();
    for (const u of unis) {
      const city = u.city || '—';
      if (!map.has(city)) map.set(city, []);
      map.get(city).push(u);
    }
    return [...map.entries()].sort(([a], [b]) => {
      const ai = CITY_ORDER.indexOf(a);
      const bi = CITY_ORDER.indexOf(b);
      const ao = ai === -1 ? 999 : ai;
      const bo = bi === -1 ? 999 : bi;
      return ao - bo || String(a).localeCompare(String(b), 'tr');
    });
  })();
  const regionUnis = uniRegion
    ? (unisByCity.find(([c]) => c === uniRegion)?.[1] || [])
    : unisByCity.flatMap(([, list]) => list);
  const selectedUni = unis.find((u) => u.id === uni);
  const uniFilter = uniQ.trim().toLocaleLowerCase('tr');
  const filteredUnisByCity = uniFilter
    ? unisByCity
      .map(([city, list]) => [
        city,
        list.filter((u) => {
          const hay = `${u.short} ${u.name_tr} ${u.name_en} ${u.city}`.toLocaleLowerCase('tr');
          return hay.includes(uniFilter);
        }),
      ])
      .filter(([, list]) => list.length)
    : unisByCity;
  const budgetPresets = ({
    TRY: [15000, 25000, 40000],
    GBP: [300, 500, 800],
    USD: [400, 650, 1000],
    EUR: [350, 600, 900],
  })[currency] || [300, 500, 800];
  const walkPresets = [5, 10, 15, 20, 30, 45, 60];
  const distancePresets = [
    { m: 500, label: '500 m' },
    { m: 1000, label: '1 km' },
    { m: 2000, label: '2 km' },
    { m: 5000, label: '5 km' },
  ];
  const STAT = {
    listings: t('home.stat_listings'),
    universities: t('home.stat_universities'),
    verified_landlords: t('home.stat_verified'),
    cities: t('home.stat_cities'),
  };
  const trustIcons = [BadgeCheck, TrendingDown, ShieldAlert, Clock];
  const fieldCls = 'h-12 w-full min-w-0 rounded-2xl border border-slate-200/90 bg-white px-3.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#0a4d68]/25 focus:border-[#0a4d68]/40';
  const heroPhoto = '/hero.jpg';

  const runHeroSearch = () => goSearch({
    university: uni,
    price_max_display: budget ? convertMoney(Number(budget), currency, 'GBP', fx) : '',
    ...(ptype ? { property_type: ptype } : {}),
    ...(maxWalk ? { max_walk: String(maxWalk) } : {}),
    ...(maxDistanceM ? { max_distance_m: String(maxDistanceM) } : {}),
    ...((maxWalk || maxDistanceM) ? { sort: 'distance' } : {}),
  });

  return (
    <div>
      <section className="relative z-0 overflow-hidden text-white">
        <div className="absolute inset-0 bg-[#052533] pointer-events-none">
          {heroPhoto ? (
            <Image
              src={heroPhoto}
              alt="Girne yat limanı, KKTC"
              fill
              priority
              sizes="100vw"
              className="object-cover object-[center_62%] sm:object-[center_55%]"
            />
          ) : (
            <>
              <div className="absolute inset-0 bg-[linear-gradient(165deg,#041820_0%,#0a4d68_42%,#0c6d7c_72%,#0a4558_100%)]" />
              <div className="ko-hero-glow absolute -top-24 -end-16 h-80 w-80 rounded-full bg-[#e0a256]/35 blur-3xl" />
              <div className="ko-hero-glow-slow absolute top-1/3 -start-20 h-64 w-64 rounded-full bg-[#7ec8d4]/25 blur-3xl" />
              <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.14) 1px, transparent 0)', backgroundSize: '28px 28px' }} />
              <svg className="absolute bottom-0 inset-x-0 w-full h-28 sm:h-40 text-[#f6f4f0]" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden>
                <path fill="currentColor" d="M0,96 C240,160 480,32 720,80 C960,128 1200,48 1440,96 L1440,160 L0,160 Z" />
              </svg>
            </>
          )}
          {heroPhoto && (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-[#041820]/90 via-[#041820]/45 to-[#041820]/20" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#041820]/75 via-[#041820]/25 to-transparent" />
            </>
          )}
        </div>

        <div className="relative container pt-10 pb-24 sm:pt-16 sm:pb-32 lg:pt-20 lg:pb-36">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 lg:gap-16 items-center">
            <div className="max-w-xl">
              <span className="ko-fade-up inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 backdrop-blur-md px-3 py-1.5 text-[11px] sm:text-xs font-semibold tracking-wide">
                <Sparkles className="h-3.5 w-3.5 text-[#e0a256]" />
                {t('hero.eyebrow')}
              </span>
              <h1 className="ko-fade-up-delay ko-display mt-4 text-[1.85rem] leading-[1.15] sm:text-4xl md:text-5xl lg:text-[3.35rem] font-semibold tracking-tight">
                {t('hero.title')}
              </h1>
              <p className="ko-fade-up-delay-2 mt-4 text-white/78 text-[15px] sm:text-lg leading-relaxed">
                {t('hero.subtitle')}
              </p>
              <div className="ko-fade-up-delay-2 mt-5 flex flex-wrap gap-2">
                {[
                  [BadgeCheck, t('trust.verified_badge')],
                  [Footprints, t('home.walk_campus')],
                  [TrendingDown, t('home.fair_price')],
                ].map(([Icon, label]) => (
                  <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/10 px-2.5 py-1 text-[11px] sm:text-xs font-medium text-white/90">
                    <Icon className="h-3.5 w-3.5 text-[#e0a256]" /> {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="hidden lg:block relative h-[420px] pointer-events-none">
              {featured.slice(0, 3).map((l, i) => {
                const poses = [
                  'top-4 end-6 w-[72%] rotate-[-6deg]',
                  'top-[28%] start-0 w-[68%] rotate-[5deg]',
                  'bottom-2 end-10 w-[64%] rotate-[-2deg]',
                ];
                return (
                  <div key={l.id || i} className={`absolute ${poses[i]} rounded-3xl overflow-hidden shadow-2xl shadow-black/40 ring-1 ring-white/20 bg-white/10 backdrop-blur-sm pointer-events-auto`}>
                    <button type="button" onClick={() => goListing(l.reference_code)} className="block w-full text-start">
                      <img src={listingPhoto(l, 0)} alt="" onError={(e) => { e.currentTarget.src = MOCK_PHOTOS[i % MOCK_PHOTOS.length]; }} className="h-44 w-full object-cover" />
                      <div className="p-3 bg-[#052533]/80">
                        <div className="text-xs text-white/70 truncate">{l.neighbourhood}, {l.city}</div>
                        <div className="text-sm font-semibold truncate mt-0.5">{locale === 'tr' ? l.title_tr : l.title_en}</div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); runHeroSearch(); }}
            className="ko-fade-up-delay-2 mt-8 lg:mt-10 rounded-[1.75rem] bg-white p-3.5 sm:p-5 shadow-[0_28px_70px_-24px_rgba(4,24,32,0.55)] text-slate-800"
          >
            <div className="grid grid-cols-1 sm:grid-cols-[1.45fr_1fr_auto] lg:grid-cols-[1.45fr_1fr_auto] gap-3">
              <div className="relative" ref={uniPickerRef}>
                <span className="mb-1.5 ms-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('search.university')}</span>
                <button
                  type="button"
                  aria-expanded={uniOpen}
                  aria-haspopup="listbox"
                  onClick={() => setUniOpen((v) => !v)}
                  className={`${fieldCls} flex items-center gap-2.5 text-start`}
                >
                  <GraduationCap className="h-4 w-4 shrink-0 text-[#0a4d68]" />
                  <span className={`min-w-0 flex-1 truncate ${selectedUni ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
                    {selectedUni
                      ? `${selectedUni.short} — ${locale === 'tr' ? selectedUni.name_tr : selectedUni.name_en}`
                      : t('search.any_university')}
                  </span>
                  {selectedUni ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setUni(''); setUniQ(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setUni(''); setUniQ(''); } }}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label={t('search.clear')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${uniOpen ? 'rotate-180' : ''}`} />
                  )}
                </button>
                {uniOpen && (
                  <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-20px_rgba(10,61,84,0.45)]">
                    <div className="border-b border-slate-100 p-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          autoFocus
                          value={uniQ}
                          onChange={(e) => setUniQ(e.target.value)}
                          placeholder={t('home.search_uni')}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-[#f8fafb] pe-3 ps-9 text-sm outline-none focus:border-[#0a4d68]/40 focus:ring-2 focus:ring-[#0a4d68]/20"
                        />
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto overscroll-contain py-1" role="listbox">
                      <button
                        type="button"
                        role="option"
                        aria-selected={!uni}
                        onClick={() => { setUni(''); setUniOpen(false); setUniQ(''); }}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm hover:bg-[var(--ko-mist)] ${!uni ? 'bg-[var(--ko-mist)] font-semibold text-[#0a4d68]' : 'text-slate-700'}`}
                      >
                        {t('search.any_university')}
                      </button>
                      {filteredUnisByCity.length === 0 && (
                        <p className="px-3 py-4 text-center text-sm text-slate-400">{t('search.no_results')}</p>
                      )}
                      {filteredUnisByCity.map(([city, list]) => (
                        <div key={city}>
                          <div className="sticky top-0 z-[1] bg-[#f4f7f9] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {city}
                          </div>
                          {list.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              role="option"
                              aria-selected={uni === u.id}
                              onClick={() => { setUni(u.id); setUniOpen(false); setUniQ(''); }}
                              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-start hover:bg-[var(--ko-mist)] ${uni === u.id ? 'bg-[var(--ko-mist)]' : ''}`}
                            >
                              <span className="inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded-md bg-[#0a4d68]/10 px-1.5 text-[10px] font-bold text-[#0a4d68]">
                                {u.short}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-[#0a3d54]">
                                  {locale === 'tr' ? u.name_tr : u.name_en}
                                </span>
                                <span className="block text-[11px] text-slate-500 tabular-nums">
                                  {u.listings_count ?? 0} {t('universities.listings_count')}
                                </span>
                              </span>
                              {uni === u.id && <Check className="h-4 w-4 shrink-0 text-[#0a4d68]" />}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <label className="block">
                <span className="mb-1.5 ms-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('search.budget')}</span>
                <div className="relative">
                  <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">{SYMBOL[currency]}</span>
                  <input
                    inputMode="numeric"
                    type="number"
                    min="0"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder={t('home.budget_max')}
                    className={`${fieldCls} ps-9`}
                  />
                </div>
              </label>

              <div className="flex items-end">
                <button type="submit" className="ko-btn-accent h-12 w-full sm:min-w-[8.5rem] rounded-2xl px-6 text-base shadow-sm">
                  <Search className="h-5 w-5" /> {t('search.button')}
                </button>
              </div>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {budgetPresets.map((n) => {
                const active = String(budget) === String(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBudget(active ? '' : String(n))}
                    className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${active ? 'border-[#0a4d68] bg-[#0a4d68] text-white' : 'border-slate-200 bg-[#f6f4f0] text-[#0a3d54] hover:border-[#0a4d68]/40'}`}
                  >
                    ≤ {SYMBOL[currency]}{n.toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB')}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className={`ms-auto inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors ${moreOpen ? 'border-[#0a4d68] bg-[var(--ko-mist)] text-[#0a4d68]' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t('home.more_options')}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <div className="mt-3.5 border-t border-slate-100 pt-3.5">
              <div className="mb-2 ms-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('home.browse_types')}</div>
              <div className="flex gap-2 overflow-x-auto ko-hide-scroll pb-0.5 -mx-1 px-1">
                {['apartment', 'studio', 'room', 'house'].map((p) => {
                  const active = ptype === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPtype(active ? '' : p)}
                      className={`shrink-0 h-10 rounded-full border px-4 text-sm font-semibold transition-colors ${active ? 'border-[#0a4d68] bg-[#0a4d68] text-white' : 'border-slate-200 bg-[#f6f4f0] text-[#0a3d54] hover:border-[#0a4d68]'}`}
                    >
                      {t(`ptype.${p}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            {moreOpen && (
              <div className="mt-3.5 rounded-2xl border border-slate-100 bg-[#f8fafb] p-3 sm:p-3.5">
                <div className="mb-1 ms-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('search.max_walk')}</div>
                <p className="mb-2 ms-0.5 text-[11px] text-slate-500">{t('search.max_walk_hint')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { setMaxWalk(''); setMaxDistanceM(''); }}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold ${!maxWalk && !maxDistanceM ? 'border-[#0a4d68] bg-[#0a4d68] text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                  >
                    {t('search.any')}
                  </button>
                  {walkPresets.map((m) => (
                    <button
                      key={`w-${m}`}
                      type="button"
                      onClick={() => {
                        setMaxDistanceM('');
                        setMaxWalk(maxWalk === String(m) ? '' : String(m));
                      }}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold ${maxWalk === String(m) ? 'border-[#0a4d68] bg-[#0a4d68] text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                    >
                      <Footprints className="h-3.5 w-3.5" /> ≤ {m} {locale === 'tr' ? 'dk' : 'min'}
                    </button>
                  ))}
                  {distancePresets.map(({ m, label }) => (
                    <button
                      key={`d-${m}`}
                      type="button"
                      onClick={() => {
                        setMaxWalk('');
                        setMaxDistanceM(maxDistanceM === String(m) ? '' : String(m));
                      }}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold ${maxDistanceM === String(m) ? 'border-[#0a4d68] bg-[#0a4d68] text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                    >
                      <MapPin className="h-3.5 w-3.5" /> ≤ {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>
      </section>

      {config && (
        <section className="container -mt-12 sm:-mt-16 relative z-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {[['listings', liveStats.listings], ['universities', liveStats.universities], ['verified_landlords', liveStats.verified_landlords], ['cities', liveStats.cities]].map(([k, v]) => (
              <div key={k} className="rounded-2xl sm:rounded-3xl bg-white border border-[#0a3d54]/8 p-4 sm:p-5 text-center shadow-[0_12px_40px_-24px_rgba(10,61,84,0.35)]">
                <div className="ko-display text-2xl sm:text-3xl font-semibold text-[#0a4d68] tabular-nums">{Number(v) || 0}</div>
                <div className="text-[11px] sm:text-xs text-slate-500 mt-1 leading-snug">{STAT[k]}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="container pt-14 md:pt-20">
        <div className="flex items-end justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h2 className="ko-display text-2xl md:text-3xl font-semibold text-[#0a3d54]">{t('home.featured')}</h2>
            <p className="text-sm text-slate-500 mt-1">{t('home.featured_sub')}</p>
          </div>
          <button onClick={() => goSearch({})} className="inline-flex items-center gap-1 text-sm font-semibold text-[#0a4d68] shrink-0 min-h-11">
            {t('home.view_all')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
        <div className="-mx-4 px-4 flex gap-4 overflow-x-auto snap-x snap-mandatory ko-hide-scroll pb-2 touch-pan-x sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible sm:pb-0">
          {featuredLoading && (
            <p className="text-sm text-slate-400 py-10 w-full text-center sm:col-span-3">{t('common.loading')}</p>
          )}
          {!featuredLoading && featured.length === 0 && (
            <p className="text-sm text-slate-400 py-10 w-full text-center sm:col-span-3">{t('search.no_results') || 'Henüz yayınlanmış ilan yok.'}</p>
          )}
          {featured.map(l => (
            <div key={l.id} className="min-w-[82%] snap-start sm:min-w-0">
              <ListingCard l={l} t={t} locale={locale} currency={currency} fx={fx} onOpen={goListing} userLoc={userLoc} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 md:mt-20 py-14 md:py-16 bg-[#0a3d54] text-white relative overflow-hidden">
        <div className="absolute -top-24 -end-24 h-72 w-72 rounded-full bg-[#e0a256]/15 blur-3xl" />
        <div className="absolute bottom-0 start-0 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="container relative">
          <div className="max-w-2xl">
            <h2 className="ko-display text-2xl md:text-3xl font-semibold">{t('trust.how_title')}</h2>
            <p className="text-white/70 mt-2 text-sm sm:text-base leading-relaxed">{t('home.how_sub')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-8">
            {t('trust.how_items').map((it, i) => {
              const Icon = trustIcons[i];
              return (
                <div key={i} className="rounded-3xl bg-white/8 border border-white/10 p-5 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-11 w-11 rounded-2xl bg-[#e0a256]/20 text-[#e0a256] flex items-center justify-center">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-semibold text-white/40 tabular-nums">{t('home.step')} {i + 1}</span>
                  </div>
                  <div className="font-semibold leading-snug">{it.t}</div>
                  <p className="text-sm text-white/65 mt-2 leading-relaxed">{it.d}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative mt-4 overflow-hidden py-16 md:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#eef4f7_0%,#f6f4f0_48%,#f6f4f0_100%)]" />
        <div className="pointer-events-none absolute -top-24 start-1/2 h-64 w-[42rem] -translate-x-1/2 rounded-full bg-[#0a4d68]/08 blur-3xl" />
        <div className="container relative">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#0a3d54]/10 bg-white/80 px-3 py-1 text-[11px] font-semibold tracking-wide text-[#0a4d68]">
                <GraduationCap className="h-3.5 w-3.5" />
                {unis.length} {t('home.campuses')}
              </div>
              <h2 className="ko-display mt-3 text-3xl md:text-4xl font-semibold text-[#0a3d54] tracking-tight">
                {t('universities.title')}
              </h2>
              <p className="mt-2 text-sm sm:text-base text-slate-500 leading-relaxed">
                {t('home.unis_sub')}
              </p>
            </div>
            <div className="flex gap-2 overflow-x-auto ko-hide-scroll -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 lg:max-w-[34rem] lg:flex-wrap lg:justify-end lg:overflow-visible">
              <button
                type="button"
                onClick={() => setUniRegion('')}
                className={`shrink-0 h-10 rounded-full px-4 text-sm font-semibold transition-colors ${!uniRegion ? 'bg-[#0a3d54] text-white shadow-sm' : 'bg-white/90 text-[#0a3d54] border border-[#0a3d54]/10 hover:bg-white'}`}
              >
                {t('home.all_regions')}
              </button>
              {unisByCity.map(([city, list]) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => setUniRegion(city)}
                  className={`shrink-0 h-10 rounded-full px-4 text-sm font-semibold transition-colors ${uniRegion === city ? 'bg-[#0a3d54] text-white shadow-sm' : 'bg-white/90 text-[#0a3d54] border border-[#0a3d54]/10 hover:bg-white'}`}
                >
                  {city}
                  <span className={`ms-1.5 tabular-nums ${uniRegion === city ? 'text-white/70' : 'text-slate-400'}`}>{list.length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 sm:mt-10 overflow-hidden rounded-[1.75rem] border border-[#0a3d54]/10 bg-white/95 shadow-[0_30px_80px_-40px_rgba(10,61,84,0.45)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 sm:px-6 py-3.5 bg-[linear-gradient(90deg,rgba(232,242,246,0.9),rgba(255,255,255,0.6))]">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0a4d68] text-white">
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[#0a3d54]">
                    {uniRegion || t('home.all_regions')}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {regionUnis.length} {t('home.campuses')}
                  </div>
                </div>
              </div>
              {uniRegion && (
                <button
                  type="button"
                  onClick={() => goSearch({ city: uniRegion })}
                  className="shrink-0 inline-flex h-9 items-center gap-1 rounded-full border border-[#0a3d54]/12 bg-white px-3 text-xs font-semibold text-[#0a4d68] hover:bg-[var(--ko-mist)]"
                >
                  {t('universities.explore')}
                  <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2">
              {regionUnis.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => goUniversity(u.slug)}
                  className="group flex items-center gap-3.5 border-b border-slate-100 px-4 sm:px-5 py-4 text-start transition-colors last:border-b-0 hover:bg-[var(--ko-mist)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0a4d68]/30 md:odd:border-e md:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <span className="relative flex h-12 min-w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(145deg,#0a4d68,#0e6a7a)] px-1 text-[9px] sm:text-[10px] font-bold tracking-wide text-white shadow-[0_10px_24px_-12px_rgba(10,77,104,0.7)]">
                    <span className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, white, transparent 55%)' }} />
                    <span className="relative text-center leading-tight">{u.short}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] sm:text-[15px] font-semibold text-[#0a3d54] leading-snug">
                      {locale === 'tr' ? u.name_tr : u.name_en}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-slate-400" />
                        {u.city}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="tabular-nums">
                        <span className="font-semibold text-[#0a4d68]">{u.listings_count ?? 0}</span>
                        {' '}{t('universities.listings_count')}
                      </span>
                    </span>
                  </span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-300 transition-all group-hover:bg-[#0a4d68] group-hover:text-white">
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container pb-16 md:pb-20">
        <div className="relative overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/70 p-5 sm:p-8">
          <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <div className="flex gap-3">
                <div className="h-12 w-12 shrink-0 rounded-2xl bg-amber-100 flex items-center justify-center">
                  <ShieldAlert className="h-6 w-6 text-amber-700" />
                </div>
                <div>
                  <div className="font-semibold text-amber-950 text-lg">{t('scam.banner_title')}</div>
                  <p className="text-sm sm:text-[15px] text-amber-900/80 mt-1 leading-relaxed">{t('scam.banner')}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
              <button onClick={() => setView({ name: 'scam' })}
                className="h-11 px-5 rounded-2xl bg-amber-900 text-white font-semibold text-sm">
                {t('nav.scam')}
              </button>
              <button onClick={() => goSearch({})}
                className="h-11 px-5 rounded-2xl bg-white border border-amber-200 text-amber-950 font-semibold text-sm inline-flex items-center justify-center gap-1.5">
                {t('hero.cta')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[1.75rem] sm:rounded-[2rem] bg-[#0a4d68] text-white p-6 sm:p-10 overflow-hidden relative">
          <div className="absolute -end-10 -top-10 h-40 w-40 rounded-full bg-[#e0a256]/25 blur-2xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            <div className="max-w-lg">
              <h2 className="ko-display text-2xl sm:text-3xl font-semibold">{t('home.cta_title')}</h2>
              <p className="text-white/75 mt-2 text-sm sm:text-base leading-relaxed">{t('home.cta_sub')}</p>
            </div>
            <button onClick={() => goSearch({})}
              className="h-12 sm:h-14 px-6 rounded-2xl bg-[#e0a256] text-[#3a2606] font-semibold inline-flex items-center justify-center gap-2 shrink-0 min-w-[11rem]">
              {t('hero.cta')} <ArrowRight className="h-5 w-5 rtl:rotate-180" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
const AMENITY_KEYS = Object.keys(AMENITY);

function SearchView({ t, locale, currency, fx, config, goListing, initialFilters, userLoc, requestLocation }) {
  const unis = config?.universities || [];
  // Always show full KKTC city list in filters (config may be stale/cached)
  const cities = [
    ...KKTC_CITIES,
    ...(config?.cities || []).filter((c) => c && !KKTC_CITIES.includes(c)),
  ];
  const [f, setF] = useState({
    university: initialFilters?.university || '',
    city: initialFilters?.city || '', property_type: initialFilters?.property_type || '', bedrooms: '', gender: '',
    furnished: false, bills_included: false, verified_only: false,
    max_walk: initialFilters?.max_walk || '',
    max_distance_m: initialFilters?.max_distance_m || '',
    price_min: '', price_max: initialFilters?.price_max_display || '',
    amenities: [],
    sort: initialFilters?.sort || (userLoc ? 'near' : 'new'),
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [debouncedF, setDebouncedF] = useState(f);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedF(f), 300);
    return () => clearTimeout(timer);
  }, [f]);

  useEffect(() => {
    if (userLoc && f.sort === 'new') {
      setF((s) => (s.sort === 'new' ? { ...s, sort: 'near' } : s));
    }
  }, [userLoc]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchKey = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedF.university) p.set('university', debouncedF.university);
    if (debouncedF.city) p.set('city', debouncedF.city);
    if (debouncedF.property_type) p.set('property_type', debouncedF.property_type);
    if (debouncedF.bedrooms !== '') p.set('bedrooms', debouncedF.bedrooms);
    if (debouncedF.gender) p.set('gender', debouncedF.gender);
    if (debouncedF.furnished) p.set('furnished', 'true');
    if (debouncedF.bills_included) p.set('bills_included', 'true');
    if (debouncedF.verified_only) p.set('verified_only', 'true');
    if (debouncedF.max_walk) p.set('max_walk', debouncedF.max_walk);
    if (debouncedF.max_distance_m) p.set('max_distance_m', debouncedF.max_distance_m);
    if (debouncedF.amenities.length) p.set('amenities', debouncedF.amenities.join(','));
    if (debouncedF.price_min) p.set('price_min', convertMoney(Number(debouncedF.price_min), currency, 'GBP', fx));
    if (debouncedF.price_max) p.set('price_max', convertMoney(Number(debouncedF.price_max), currency, 'GBP', fx));
    if (userLoc?.lat != null && userLoc?.lng != null) {
      p.set('near_lat', String(userLoc.lat));
      p.set('near_lng', String(userLoc.lng));
    }
    p.set('sort', debouncedF.sort);
    p.set('limit', '48');
    return p.toString();
  }, [debouncedF, currency, fx, userLoc]);

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['listings', searchKey],
    queryFn: async () => {
      const r = await api(`listings?${searchKey}`);
      const d = await r.json();
      if (!r.ok) throw new Error('search_failed');
      return { items: d.items || [], total: d.total || 0 };
    },
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const loading = isFetching && !data;
  const searchErr = isError;

  const toggleAmenity = (a) => setF(s => ({ ...s, amenities: s.amenities.includes(a) ? s.amenities.filter(x => x !== a) : [...s.amenities, a] }));
  const clear = () => setF({ university: '', city: '', property_type: '', bedrooms: '', gender: '', furnished: false, bills_included: false, verified_only: false, max_walk: '', max_distance_m: '', price_min: '', price_max: '', amenities: [], sort: userLoc ? 'near' : 'new' });

  const FilterField = ({ label, children }) => (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
  const selCls = 'w-full h-10 rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/30';

  const FiltersBody = (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-[#0a3d54]">{t('search.filters')}</h2>
        <button onClick={clear} className="text-xs font-semibold text-[#0a4d68] hover:underline">{t('search.clear')}</button>
      </div>
      <FilterField label={t('search.university')}>
        <select className={selCls} value={f.university} onChange={e => setF(s => ({ ...s, university: e.target.value }))}>
          <option value="">{t('search.any_university')}</option>
          {unis.map(u => <option key={u.id} value={u.id}>{u.short || u.name_tr || u.name_en}</option>)}
        </select>
      </FilterField>
      <FilterField label={t('search.max_walk')}>
        <div className="space-y-2">
          <select
            className={selCls}
            value={f.max_walk ? `w:${f.max_walk}` : (f.max_distance_m ? `d:${f.max_distance_m}` : '')}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                setF((s) => ({ ...s, max_walk: '', max_distance_m: '' }));
                return;
              }
              if (v.startsWith('w:')) {
                setF((s) => ({ ...s, max_walk: v.slice(2), max_distance_m: '', sort: s.sort === 'near' ? s.sort : 'distance' }));
              } else if (v.startsWith('d:')) {
                setF((s) => ({ ...s, max_distance_m: v.slice(2), max_walk: '', sort: s.sort === 'near' ? s.sort : 'distance' }));
              }
            }}
          >
            <option value="">{t('search.any')}</option>
            <optgroup label={locale === 'tr' ? 'Yürüme süresi' : 'Walk time'}>
              {[5, 10, 15, 20, 30, 45, 60].map((w) => (
                <option key={`w-${w}`} value={`w:${w}`}>{`≤ ${w} ${locale === 'tr' ? 'dk' : 'min'}`}</option>
              ))}
            </optgroup>
            <optgroup label={locale === 'tr' ? 'Mesafe' : 'Distance'}>
              <option value="d:500">≤ 500 m</option>
              <option value="d:1000">≤ 1 km</option>
              <option value="d:2000">≤ 2 km</option>
              <option value="d:5000">≤ 5 km</option>
            </optgroup>
          </select>
          <p className="text-[11px] text-slate-500 leading-snug">{t('search.max_walk_hint')}</p>
        </div>
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
            <button key={a} type="button" onClick={() => toggleAmenity(a)}
              className={`text-xs rounded-full px-2.5 py-1 border ${f.amenities.includes(a) ? 'bg-[#0a4d68] text-white border-[#0a4d68]' : 'bg-white text-slate-600 border-slate-200'}`}>
              {t(`amenity.${a}`) !== `amenity.${a}` ? t(`amenity.${a}`) : (AMENITY[a]?.en || a)}
            </button>
          ))}
        </div>
      </FilterField>
      <button type="button" onClick={() => { setFiltersOpen(false); refetch(); }} className="lg:hidden w-full h-11 rounded-xl bg-[#0a4d68] text-white font-semibold mt-2">
        {t('search.button')}
      </button>
    </>
  );

  return (
    <div className="container py-8">
      <div className="lg:hidden mb-4">
        <button type="button" onClick={() => setFiltersOpen(true)}
          className="inline-flex items-center gap-2 h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0a4d68]">
          <SlidersHorizontal className="h-4 w-4" /> {t('search.filters')}
        </button>
      </div>

      {filtersOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setFiltersOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-[#0a3d54]">{t('search.filters')}</span>
              <button type="button" onClick={() => setFiltersOpen(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            {FiltersBody}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        <aside className="hidden lg:block lg:sticky lg:top-24 h-fit bg-white rounded-2xl border border-slate-200 p-5">
          {FiltersBody}
        </aside>

        <div>
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="text-sm text-slate-600"><span className="font-bold text-[#0a3d54]">{total}</span> {t('search.results')}</div>
            <select className="h-10 rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none" value={f.sort} onChange={e => setF(s => ({ ...s, sort: e.target.value }))}>
              <option value="new">{t('search.sort_new')}</option>
              <option value="price_asc">{t('search.sort_price_asc')}</option>
              <option value="price_desc">{t('search.sort_price_desc')}</option>
              {userLoc && <option value="near">{t('search.sort_near')}</option>}
              <option value="distance">{t('search.sort_distance')}</option>
            </select>
          </div>
          {!userLoc && (
            <button
              type="button"
              onClick={() => requestLocation?.()}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#0a4d68]/20 bg-[#e8f4f7]/80 px-3 py-2.5 text-sm font-medium text-[#0a3d54] sm:w-auto"
            >
              <MapPin className="h-4 w-4" /> {t('geo.allow')}
            </button>
          )}
          {loading ? (
            <div className="text-center py-20 text-slate-400">{t('common.loading')}</div>
          ) : searchErr ? (
            <div className="text-center py-20 text-slate-400">{t('search.error')}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-slate-400">{t('search.no_results')}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {items.map(l => <ListingCard key={l.id} l={l} t={t} locale={locale} currency={currency} fx={fx} onOpen={goListing} userLoc={userLoc} />)}
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
function ListingView({ t, locale, currency, fx, refCode, setView, goListing, auth, setAuth, setAuthModal, setReportModal, userLoc }) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [reveal, setReveal] = useState(null);
  const [revealErr, setRevealErr] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [msgDraft, setMsgDraft] = useState('');
  const [msgBusy, setMsgBusy] = useState(false);
  const [msgErr, setMsgErr] = useState('');
  const [msgOk, setMsgOk] = useState(null);
  const thumbStripRef = useRef(null);
  const [thumbCanScroll, setThumbCanScroll] = useState({ left: false, right: false });

  const updateThumbScrollHints = useCallback(() => {
    const el = thumbStripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setThumbCanScroll({
      left: el.scrollLeft > 4,
      right: max > 4 && el.scrollLeft < max - 4,
    });
  }, []);

  const scrollThumbs = useCallback((dir) => {
    const el = thumbStripRef.current;
    if (!el) return;
    const step = Math.min(el.clientWidth * 0.75, 280);
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }, []);

  const { data: listingData, isLoading, isError } = useQuery({
    queryKey: ['listing', refCode],
    queryFn: async () => {
      const r = await api(`listings/${refCode}`);
      const d = await r.json();
      if (!r.ok || d.error || !d.id) throw new Error('not_found');
      return d;
    },
    enabled: !!refCode,
  });

  const l = isError ? { error: true } : (isLoading ? null : listingData);

  useEffect(() => {
    setPhotoIdx(0);
    setLightboxOpen(false);
    setReveal(null);
    setRevealErr('');
    setShowOriginal(false);
    setSaved(false);
  }, [refCode]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const count = (Array.isArray(listingData?.photos) && listingData.photos.length)
      ? listingData.photos.length
      : 3;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowLeft') setPhotoIdx((i) => (i - 1 + count) % count);
      if (e.key === 'ArrowRight') setPhotoIdx((i) => (i + 1) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [lightboxOpen, listingData?.photos]);

  useEffect(() => {
    const el = thumbStripRef.current;
    if (!el) return undefined;
    updateThumbScrollHints();
    const onScroll = () => updateThumbScrollHints();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateThumbScrollHints) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [l?.id, updateThumbScrollHints]);

  useEffect(() => {
    if (lightboxOpen) return;
    const strip = thumbStripRef.current;
    if (!strip) return;
    const active = strip.querySelector(`[data-thumb-idx="${photoIdx}"]`);
    if (active?.scrollIntoView) {
      active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
    updateThumbScrollHints();
  }, [photoIdx, lightboxOpen, updateThumbScrollHints]);

  useEffect(() => {
    if (!auth?.signedIn || !l?.id) return;
    let cancelled = false;
    api('my/saved').then((r) => r.json()).then((d) => {
      if (!cancelled) setSaved((d.items || []).some((x) => x.id === l.id));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [auth?.signedIn, l?.id]);

  const doReveal = async () => {
    setRevealErr('');
    // Ensure we have a live session before calling the gated endpoint
    const session = await refreshSessionIntoAuth(setAuth);
    if (!session?.user) {
      setAuthModal('signin');
      return;
    }
    const res = await api('reveal', {
      method: 'POST',
      body: JSON.stringify({ ref: refCode }),
    });
    if (res.status === 401) {
      // One retry after forced refresh (stale token)
      const again = await refreshSessionIntoAuth(setAuth);
      if (!again?.user) {
        setAuthModal('signin');
        return;
      }
      const retry = await api('reveal', {
        method: 'POST',
        body: JSON.stringify({ ref: refCode }),
      });
      if (retry.status === 401) { setAuthModal('signin'); return; }
      if (retry.status === 429) { setRevealErr(t('contact.limit')); return; }
      if (!retry.ok) {
        const errBody = await retry.json().catch(() => ({}));
        if (errBody.error === 'not_found') setRevealErr(t('listing.not_found'));
        else setRevealErr(t('contact.error'));
        return;
      }
      setReveal(await retry.json());
      return;
    }
    if (res.status === 429) { setRevealErr(t('contact.limit')); return; }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      if (errBody.error === 'not_found') setRevealErr(t('listing.not_found'));
      else setRevealErr(t('contact.error'));
      return;
    }
    setReveal(await res.json());
  };

  const doSendMessage = async () => {
    setMsgErr('');
    setMsgOk(null);
    const text = msgDraft.trim();
    if (!text) return;
    const session = await refreshSessionIntoAuth(setAuth);
    if (!session?.user) {
      setAuthModal('signin');
      return;
    }
    setMsgBusy(true);
    const res = await api('messages', {
      method: 'POST',
      body: JSON.stringify({ ref: refCode, body: text }),
    });
    const data = await res.json().catch(() => ({}));
    setMsgBusy(false);
    if (res.status === 401) {
      setAuthModal('signin');
      return;
    }
    if (!res.ok) {
      if (data.error === 'own_listing') setMsgErr(t('contact.message_own'));
      else setMsgErr(t('contact.message_error'));
      return;
    }
    setMsgDraft('');
    setMsgOk(data.conversation_id);
  };

  const toggleSave = async () => {
    if (!auth.signedIn) { setAuthModal('signin'); return; }
    if (!l?.id) return;
    const next = !saved;
    setSaved(next);
    const res = await api('my/saved', {
      method: 'POST',
      body: JSON.stringify({ listing_id: l.id, save: next }),
    });
    if (!res.ok) setSaved(!next);
  };

  if (l === null) {
    return <div className="container py-20 text-center text-slate-400">{t('common.loading')}</div>;
  }
  if (l?.error) {
    return (
      <div className="container py-20 text-center">
        <p className="text-slate-500 mb-4">{t('listing.not_found')}</p>
        <button type="button" onClick={() => setView({ name: 'search', filters: {} })} className="h-11 px-5 rounded-xl bg-[#0a4d68] text-white font-semibold">{t('listing.back')}</button>
      </div>
    );
  }
  const baseLang = listingLang(locale);
  const mt = isMachineTranslated(locale);
  const title = (mt && showOriginal) ? l.title_tr : (baseLang === 'tr' ? l.title_tr : l.title_en);
  const desc = (mt && showOriginal) ? l.description_tr : (baseLang === 'tr' ? l.description_tr : l.description_en);
  const pi = l.price_index;
  const photos = (Array.isArray(l.photos) && l.photos.length)
    ? l.photos
    : [listingPhoto(l, 0), listingPhoto(l, 1), listingPhoto(l, 2)];
  const totalFirstMonth = l.deposit && l.price?.currency === l.deposit.currency
    ? { amount: Number(l.price.amount) + Number(l.deposit.amount), currency: l.price.currency } : null;
  const daysConfirmed = l.last_confirmed_available_at
    ? Math.max(0, Math.floor((Date.now() - new Date(l.last_confirmed_available_at)) / 86400000))
    : null;

  return (
    <div className="container py-6 pb-28 lg:pb-10 max-w-full">
      <button type="button" onClick={() => setView({ name: 'search', filters: {} })} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#0a4d68] mb-4">
        <ChevronLeft className="h-4 w-4 shrink-0" /> {t('listing.back')}
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
        {/* Left */}
        <div className="min-w-0 space-y-5">
          {/* Gallery */}
          <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white max-w-full">
            <div className="relative aspect-[16/10] sm:aspect-[16/9] bg-slate-100">
              <img
                src={photos[photoIdx] || photos[0]}
                alt={title || ''}
                onError={(e) => { e.currentTarget.src = MOCK_PHOTOS[0]; }}
                className="absolute inset-0 h-full w-full object-cover"
                decoding="async"
                fetchPriority="high"
              />
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="absolute inset-0 z-[1] cursor-zoom-in bg-transparent"
                aria-label={locale === 'tr' ? 'Fotoğrafı büyüt' : 'Enlarge photo'}
              />
              <div className="pointer-events-none absolute top-2.5 start-2.5 end-2.5 z-[2] flex flex-wrap gap-1.5">
                {l.landlord_verified && <span className="pointer-events-auto"><VerifiedPill t={t} /></span>}
                {l.landlord_is_agency && (
                  <span className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-white/90 text-slate-700 px-2.5 py-1 text-xs font-semibold">
                    <Building2 className="h-3.5 w-3.5" /> {t('listing.agency')}
                  </span>
                )}
                {photos.length > 1 && (
                  <span className="ms-auto rounded-full bg-black/55 text-white px-2.5 py-1 text-[11px] font-semibold tabular-nums">
                    {photoIdx + 1}/{photos.length}
                  </span>
                )}
              </div>
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Önceki"
                    onClick={() => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length)}
                    className="absolute start-2 top-1/2 z-[3] -translate-y-1/2 h-10 w-10 rounded-full bg-black/45 text-white flex items-center justify-center"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Sonraki"
                    onClick={() => setPhotoIdx((i) => (i + 1) % photos.length)}
                    className="absolute end-2 top-1/2 z-[3] -translate-y-1/2 h-10 w-10 rounded-full bg-black/45 text-white flex items-center justify-center"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
            {photos.length > 1 && (
              <div className="relative max-w-full">
                {thumbCanScroll.left && (
                  <button
                    type="button"
                    aria-label="Sola kaydır"
                    onClick={() => scrollThumbs(-1)}
                    className="absolute start-1 top-1/2 z-10 -translate-y-1/2 h-9 w-9 rounded-full bg-white/95 border border-slate-200 text-[#0a3d54] shadow-sm flex items-center justify-center"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                {thumbCanScroll.right && (
                  <button
                    type="button"
                    aria-label="Sağa kaydır"
                    onClick={() => scrollThumbs(1)}
                    className="absolute end-1 top-1/2 z-10 -translate-y-1/2 h-9 w-9 rounded-full bg-white/95 border border-slate-200 text-[#0a3d54] shadow-sm flex items-center justify-center"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                <div
                  ref={thumbStripRef}
                  className="flex gap-2 p-2 overflow-x-auto overscroll-x-contain ko-hide-scroll touch-pan-x max-w-full scroll-smooth"
                >
                  {photos.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      data-thumb-idx={i}
                      onClick={() => setPhotoIdx(i)}
                      className={`h-14 w-20 sm:h-16 sm:w-24 shrink-0 rounded-lg overflow-hidden border-2 ${i === photoIdx ? 'border-[#0a4d68]' : 'border-transparent'}`}
                    >
                      <img
                        src={p}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={(e) => { e.currentTarget.src = MOCK_PHOTOS[i % MOCK_PHOTOS.length]; }}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Title + key facts */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 mb-1.5">
              <span className="inline-flex items-center gap-1 min-w-0">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="truncate">{l.neighbourhood}, {l.city}</span>
              </span>
              <span className="text-xs bg-slate-100 rounded px-1.5 py-0.5 shrink-0">{t('listing.ref')}: {l.reference_code}</span>
            </div>
            <div className="flex items-start gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-[#0a3d54] flex-1 min-w-0 break-words leading-snug">{title}</h1>
              <button
                type="button"
                onClick={toggleSave}
                aria-label={t('nav.saved')}
                className={`shrink-0 h-11 w-11 rounded-xl border flex items-center justify-center ${saved ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
              >
                <Heart className={`h-5 w-5 ${saved ? 'fill-current' : ''}`} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <PriceIndexPill pi={pi} t={t} listing={l} />
              {l.room_share && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#0a4d68]/10 text-[#0a4d68] px-2.5 py-1 text-xs font-semibold">
                  <Users className="h-3.5 w-3.5 shrink-0" /> {t('listing.shared')} · +{l.flatmates} {t('listing.flatmates')}
                </span>
              )}
              {(() => {
                const d = distanceToListing(userLoc, l);
                if (d == null) return null;
                return (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100 px-2.5 py-1 text-xs font-semibold">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {formatDistance(d, locale)} {t('geo.from_you')}
                  </span>
                );
              })()}
              {l.walking_minutes != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#0a4d68] text-white px-2.5 py-1 text-xs font-semibold max-w-full">
                  <Waypoints className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {l.walking_minutes} {locale === 'tr' ? 'dk' : 'min'}
                    {l.distance_m != null ? ` · ${formatDistance(Number(l.distance_m), locale)}` : ''}
                    {' '}{t('listing.walk_to')} (
                    {(l.universities?.length
                      ? l.universities.map((u) => u.short).join(', ')
                      : l.university?.short) || '—'}
                    )
                  </span>
                </span>
              )}
              {daysConfirmed != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] text-[#15803d] px-2.5 py-1 text-xs font-medium">
                  <Clock className="h-3.5 w-3.5 shrink-0" /> {daysConfirmed} {t('listing.confirmed')}
                </span>
              )}
            </div>
          </div>

          {/* Facts grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {[
              [BedDouble, l.property_type === 'room' ? t('listing.private_room') : (l.bedrooms > 0 ? `${l.bedrooms} ${t('listing.bedrooms_n')}` : t('ptype.studio'))],
              [Bath, `${l.bathrooms} ${t('listing.bathrooms_n')}`],
              [Maximize, l.size_sqm ? `${l.size_sqm} m²` : '—'],
              [Sofa, l.furnished ? t('listing.furnished_yes') : t('listing.furnished_no')],
            ].map(([Icon, label], i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-2 min-w-0">
                <Icon className="h-5 w-5 text-[#0a4d68] shrink-0" />
                <span className="text-sm text-slate-700 truncate">{label}</span>
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="min-w-0">
            <h2 className="font-bold text-[#0a3d54] mb-2">{t('listing.description')}</h2>
            {mt && (
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-500">
                <Info className="h-3.5 w-3.5 shrink-0" /> {t('listing.machine_translated')}
                <button type="button" onClick={() => setShowOriginal(o => !o)} className="font-semibold text-[#0a4d68] underline">
                  {showOriginal ? '↩' : t('listing.view_original')}
                </button>
              </div>
            )}
            <p lang={(mt && !showOriginal) ? 'en' : 'tr'} className="text-slate-600 leading-relaxed whitespace-pre-line break-words">{desc}</p>
          </div>

          {/* Amenities */}
          {(l.amenities || []).length > 0 && (
            <div className="min-w-0">
              <h2 className="font-bold text-[#0a3d54] mb-3">{t('listing.amenities')}</h2>
              <div className="flex flex-wrap gap-2">
                {l.amenities.map((a) => {
                  const Icon = AMENITY[a]?.icon || Check;
                  const label = t(`amenity.${a}`);
                  const text = label === `amenity.${a}` ? (AMENITY[a]?.[locale] || AMENITY[a]?.en || a) : label;
                  return (
                    <span key={a} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-slate-700 max-w-full">
                      <Icon className="h-3.5 w-3.5 text-[#0a4d68] shrink-0" />
                      <span className="truncate">{text}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Location */}
          <div className="min-w-0">
            <h2 className="font-bold text-[#0a3d54] mb-2">{t('listing.location')}</h2>
            <MapCircle l={l} t={t} />
            <p className="text-xs text-slate-500 mt-2 flex items-start gap-1.5"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {t('listing.approx_note')}</p>
          </div>

          {/* Price history */}
          {(l.price_history?.length > 0) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 min-w-0 overflow-hidden">
              <h2 className="font-bold text-[#0a3d54] mb-2">{t('priceindex.history')}</h2>
              <PriceHistoryChart history={l.price_history} currency={currency} fx={fx} locale={locale} t={t} />
            </div>
          )}

          <button type="button" onClick={() => setReportModal(l.reference_code)} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-500">
            <Flag className="h-4 w-4" /> {t('listing.report')}
          </button>
        </div>

        {/* Right sticky sidebar — stays visible while scrolling listing content */}
        <aside className="min-w-0 w-full lg:sticky lg:top-20 xl:top-24 self-start space-y-4 lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-0.5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 overflow-hidden">
            <PriceDisplay price={l.price} currency={currency} fx={fx} locale={locale} t={t} size="lg" />
            <div className="mt-4 border-t border-slate-100 pt-4 space-y-2 text-sm">
              <div className="font-semibold text-[#0a3d54] mb-1">{t('listing.cost_breakdown')}</div>
              <Row label={t('listing.rent')} value={<PriceInline price={l.price} currency={currency} fx={fx} locale={locale} />} />
              <Row label={t('listing.deposit')} value={l.deposit ? <PriceInline price={l.deposit} currency={currency} fx={fx} locale={locale} /> : '—'} />
              <Row label={t('listing.bills')} value={l.bills_included ? t('listing.bills_included_short') : (l.bills_note || '—')} muted />
              <Row label={t('listing.agency_fee')} value={l.agency_fee_note || '—'} muted />
              {totalFirstMonth && (
                <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2.5 mt-1">
                  <span className="font-semibold text-[#0a3d54] shrink-0">{t('listing.total_first_month')}</span>
                  <span className="font-bold text-[#0a3d54] text-end min-w-0 break-words"><PriceInline price={totalFirstMonth} currency={currency} fx={fx} locale={locale} /></span>
                </div>
              )}
            </div>
            {pi?.enough && (
              <div className="mt-4 rounded-xl bg-[#f8fafc] border border-slate-100 p-3 min-w-0">
                <div className="text-xs font-semibold text-slate-500 mb-1">{t('priceindex.title')}</div>
                <div className="text-sm text-slate-700 break-words">
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

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 overflow-hidden">
            <h3 className="font-bold text-[#0a3d54] mb-1 flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0" /> {t('contact.title')}
            </h3>
            {reveal ? (
              <div className="mt-3 space-y-2">
                <div className="rounded-xl bg-[#e8f2f6] p-3 text-center min-w-0">
                  <div className="text-xs text-slate-500 truncate">{l.landlord_name}</div>
                  <div className="text-lg font-bold text-[#0a3d54] break-all" dir="ltr">{reveal.phone}</div>
                </div>
                <a href={reveal.whatsapp_url} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-2 h-11 rounded-xl bg-[#25D366] text-white font-semibold">
                  <MessageCircle className="h-5 w-5 shrink-0" /> {t('contact.whatsapp')}
                </a>
                <a href={`tel:${reveal.phone.replace(/\s/g, '')}`}
                  className="flex items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 text-slate-700 font-semibold">
                  <Phone className="h-4 w-4 shrink-0" /> {t('contact.call')}
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
                <p className="text-xs text-slate-500 mb-3 break-words">{t('contact.gated_desc')}</p>
                {revealErr && <p className="text-xs text-red-600 mb-2">{revealErr}</p>}
                <button type="button" onClick={doReveal}
                  className="w-full h-11 rounded-xl bg-[#0a4d68] hover:bg-[#08415c] text-white font-semibold">
                  {auth.signedIn ? t('contact.reveal') : t('contact.signin_to_reveal')}
                </button>
              </div>
            )}

            <div id="listing-message-box" className="mt-5 pt-4 border-t border-slate-100">
              <h4 className="font-bold text-[#0a3d54] mb-2 flex items-center gap-2 text-sm">
                <MessageCircle className="h-4 w-4 shrink-0" /> {t('contact.message_title')}
              </h4>
              {msgOk ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                  <p className="text-sm text-emerald-900">{t('contact.message_sent')}</p>
                  <button
                    type="button"
                    onClick={() => setView({ name: 'messages', id: msgOk })}
                    className="mt-2 w-full h-10 rounded-xl bg-[#0a4d68] text-white text-sm font-semibold"
                  >
                    {t('contact.message_open')}
                  </button>
                </div>
              ) : (
                <>
                  <textarea
                    id="listing-message-input"
                    rows={3}
                    value={msgDraft}
                    onChange={(e) => setMsgDraft(e.target.value.slice(0, 2000))}
                    placeholder={t('contact.message_ph')}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/25 resize-none"
                  />
                  {msgErr && <p className="text-xs text-red-600 mt-1.5">{msgErr}</p>}
                  <button
                    type="button"
                    disabled={msgBusy || !msgDraft.trim()}
                    onClick={doSendMessage}
                    className="mt-2 w-full h-11 rounded-xl border border-[#0a4d68] text-[#0a4d68] font-semibold hover:bg-[#e8f4f7] disabled:opacity-50"
                  >
                    {auth.signedIn ? (msgBusy ? t('common.loading') : t('contact.message_send')) : t('contact.message_signin')}
                  </button>
                </>
              )}
            </div>
          </div>

          <ScamBanner t={t} compact />
        </aside>
      </div>

      {l.similar?.length > 0 && (
        <div className="mt-10 sm:mt-12 mb-4 min-w-0">
          <h2 className="text-xl font-bold text-[#0a3d54] mb-5">{t('listing.similar')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {l.similar.map(s => <ListingCard key={s.id} l={s} t={t} locale={locale} currency={currency} fx={fx} onOpen={goListing} userLoc={userLoc} />)}
          </div>
        </div>
      )}

      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2 w-full max-w-lg mx-auto">
          {reveal ? (
            <a href={reveal.whatsapp_url} target="_blank" rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-2 h-12 rounded-xl bg-[#25D366] text-white font-semibold">
              <MessageCircle className="h-5 w-5 shrink-0" /> {t('contact.whatsapp')}
            </a>
          ) : (
            <button type="button" onClick={doReveal}
              className="flex-1 h-12 rounded-xl bg-[#0a4d68] text-white font-semibold">
              {auth.signedIn ? t('contact.reveal') : t('contact.signin_to_reveal')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!auth.signedIn) { setAuthModal('signin'); return; }
              document.getElementById('listing-message-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              document.getElementById('listing-message-input')?.focus();
            }}
            className="h-12 px-4 rounded-xl border border-[#0a4d68] text-[#0a4d68] font-semibold shrink-0"
          >
            {t('contact.message_title')}
          </button>
        </div>
      </div>

      {lightboxOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200] flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-label={locale === 'tr' ? 'Fotoğraf galerisi' : 'Photo gallery'}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-3 sm:px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tabular-nums text-white/90">
              {photoIdx + 1}/{photos.length}
            </span>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label={locale === 'tr' ? 'Kapat' : 'Close'}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 sm:px-16">
            {photos.length > 1 && (
              <button
                type="button"
                aria-label="Önceki"
                onClick={() => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length)}
                className="absolute start-2 sm:start-4 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            <img
              src={photos[photoIdx] || photos[0]}
              alt={title || ''}
              onError={(e) => { e.currentTarget.src = MOCK_PHOTOS[0]; }}
              className="max-h-full max-w-full object-contain"
              decoding="async"
            />
            {photos.length > 1 && (
              <button
                type="button"
                aria-label="Sonraki"
                onClick={() => setPhotoIdx((i) => (i + 1) % photos.length)}
                className="absolute end-2 sm:end-4 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {photos.length > 1 && (
            <div className="flex shrink-0 justify-center gap-2 overflow-x-auto ko-hide-scroll px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {photos.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPhotoIdx(i)}
                  className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === photoIdx ? 'border-white' : 'border-transparent opacity-55'}`}
                >
                  <img
                    src={p}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => { e.currentTarget.src = MOCK_PHOTOS[i % MOCK_PHOTOS.length]; }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function Row({ label, value, muted }) {
  return (
    <div className="flex items-start justify-between gap-3 min-w-0">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`min-w-0 text-end break-words ${muted ? 'text-slate-500 text-xs' : 'text-slate-800 font-medium'}`}>{value}</span>
    </div>
  );
}
function PriceInline({ price, currency, fx, locale }) {
  if (!price || price.amount == null) return <>—</>;
  const same = price.currency === currency;
  if (same) return <>{fmtMoney(price.amount, price.currency, locale)}</>;
  return <>≈ {fmtMoney(convertMoney(price.amount, price.currency, currency, fx), currency, locale)}</>;
}

// ---------------------------------------------------------------------------
// University landing
// ---------------------------------------------------------------------------
function UniversityView({ t, locale, currency, fx, slug, goListing, userLoc }) {
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
          {data.listings.map(l => <ListingCard key={l.id} l={l} t={t} locale={locale} currency={currency} fx={fx} onOpen={goListing} userLoc={userLoc} />)}
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
    <footer className="relative mt-10 overflow-hidden bg-[#062636] text-white/80">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(10,77,104,0.55),transparent_50%)]" />
      <div className="relative container py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="mb-4 inline-flex rounded-2xl bg-white px-3 py-2 shadow-sm shadow-black/20">
            <BrandMark
              title={t('brand')}
              className="h-12 sm:h-14 w-auto max-w-[min(70vw,240px)]"
            />
          </div>
          <p className="text-sm leading-relaxed max-w-md text-white/70">{t('footer.about')}</p>
        </div>
        <div>
          <div className="font-semibold text-white mb-3">{t('nav.search')}</div>
          <ul className="space-y-2 text-sm">
            <li><button onClick={() => setView({ name: 'search', filters: {} })} className="hover:text-white transition-colors">{t('nav.search')}</button></li>
            <li><button onClick={() => setView({ name: 'how' })} className="hover:text-white transition-colors">{t('nav.how')}</button></li>
            <li><button onClick={() => setView({ name: 'scam' })} className="hover:text-white transition-colors">{t('nav.scam')}</button></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-white mb-3">{t('universities.title')}</div>
          <ul className="space-y-2 text-sm">
            {(config?.universities || []).slice(0, 5).map(u => (
              <li key={u.id}><button onClick={() => goUniversity(u.slug)} className="hover:text-white transition-colors">{u.short}</button></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="relative border-t border-white/10 py-4 text-center text-xs text-white/45">
        © {new Date().getFullYear()} {t('brand')}. {t('footer.rights')}
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
function AuthModal({ t, locale, onClose, setAuth, initialMode = 'signin' }) {
  const [mode, setMode] = useState(initialMode === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Girne');
  const [isAgency, setIsAgency] = useState(false);
  const [agencyName, setAgencyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(false);
  const [awaitingEmail, setAwaitingEmail] = useState(false);

  const inp = 'w-full h-12 rounded-2xl border border-slate-200/90 bg-[#f8fafb] px-3.5 text-sm mt-1.5 outline-none focus:bg-white focus:ring-2 focus:ring-[#0a4d68]/25 focus:border-[#0a4d68]/35 transition';
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');

  const mapAuthError = (error) => {
    const raw = String(error?.message || error || '');
    const lower = raw.toLowerCase();
    if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
      return t('auth.err_invalid');
    }
    if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
      return t('auth.err_unconfirmed');
    }
    return raw || t('auth.err');
  };

  const validate = (authMode) => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return t('auth.err_email');
    if (authMode === 'reset') return null;
    if (!password || password.length < 8) return t('auth.err_password');
    if (authMode !== 'signup') return null;
    if (password !== password2) return t('auth.err_password_match');
    if (!fullName.trim() || fullName.trim().length < 2) return t('auth.err_name');
    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) return t('auth.err_phone');
    if (isAgency && !agencyName.trim()) return t('auth.err_agency');
    return null;
  };

  const sendPasswordReset = async () => {
    const supabase = createClient();
    if (!supabase) { setMsg(t('auth.err_config')); setMsgOk(false); return; }
    const v = validate('reset');
    if (v) { setMsg(v); setMsgOk(false); return; }
    setBusy(true); setMsg(''); setMsgOk(false);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${siteUrl}/`,
    });
    setBusy(false);
    if (error) { setMsg(mapAuthError(error)); setMsgOk(false); return; }
    setMsg(t('auth.reset_sent'));
    setMsgOk(true);
  };

  const realAuth = async (authMode) => {
    const supabase = createClient();
    if (!supabase) { setMsg(t('auth.err_config')); setMsgOk(false); return; }
    const v = validate(authMode);
    if (v) { setMsg(v); setMsgOk(false); return; }

    setBusy(true); setMsg(''); setMsgOk(false);
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: `${siteUrl}/`,
            data: {
              // Single free account type — everyone can search and list
              role: 'landlord',
              full_name: fullName.trim(),
              phone_e164: phone.trim(),
              city,
              is_agency: isAgency,
              agency_name: agencyName.trim() || null,
              preferred_language: locale || 'tr',
            },
          },
        });
        if (error) { setMsg(mapAuthError(error)); setBusy(false); return; }
        if (data.session) {
          setAccessToken(data.session.access_token);
          const profilePayload = {
            full_name: fullName.trim(),
            phone_e164: phone.trim(),
            city,
            is_agency: isAgency,
            agency_name: agencyName.trim() || null,
            display_name: fullName.trim(),
            request_verification: false,
          };
          // Ensure listing capability for every new account
          await api('my/become-landlord', { method: 'POST', body: JSON.stringify(profilePayload) }).catch(() => {});
          setAuth({
            signedIn: true,
            studentId: data.user.id,
            email: data.user.email,
            role: data.user.app_metadata?.role || 'landlord',
            accessToken: data.session.access_token,
          });
          onClose();
        } else {
          setAwaitingEmail(true);
          setMsg(t('auth.check_email'));
          setMsgOk(true);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) { setMsg(mapAuthError(error)); setBusy(false); return; }
        setAccessToken(data.session.access_token);
        const metaRole = data.user.app_metadata?.role || data.user.user_metadata?.role || 'landlord';
        setAuth({
          signedIn: true,
          studentId: data.user.id,
          email: data.user.email,
          role: metaRole,
          accessToken: data.session.access_token,
        });
        onClose();
      }
    } catch (e) { setMsg(t('auth.err')); }
    setBusy(false);
  };

  if (awaitingEmail) {
    return (
      <Overlay onClose={onClose} wide>
        <div className="text-center py-4 sm:py-6">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-[#e8f2f6] text-[#0a4d68] flex items-center justify-center mb-4">
            <Mail className="h-7 w-7" />
          </div>
          <h2 className="ko-display text-xl font-semibold text-[#0a3d54]">{t('auth.check_email_title')}</h2>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed px-2">{t('auth.check_email')}</p>
          <p className="text-xs text-slate-400 mt-2" dir="ltr">{email}</p>
          <button type="button" onClick={() => { setAwaitingEmail(false); setMode('signin'); setMsg(''); }}
            className="mt-6 w-full h-12 rounded-2xl bg-[#0a4d68] text-white font-semibold">
            {t('auth.signin')}
          </button>
          <button type="button" onClick={() => { setAwaitingEmail(false); setMsg(''); }}
            className="mt-2 w-full h-11 rounded-2xl text-sm font-medium text-slate-500">
            {t('auth.back_to_form')}
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose} wide>
      <div className="pe-8">
        <h2 className="ko-display text-xl sm:text-2xl font-semibold text-[#0a3d54]">
          {mode === 'signup' ? t('auth.signup_title') : t('auth.signin_title')}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {mode === 'signup' ? t('auth.signup_sub') : t('auth.signin_sub')}
        </p>
        {mode === 'signup' && (
          <span className="mt-2 inline-flex items-center rounded-md bg-[#dcfce7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#15803d]">
            {t('auth.free_badge')}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100">
        {[['signin', t('auth.signin')], ['signup', t('auth.signup')]].map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setMode(k); setMsg(''); setMsgOk(false); }}
            className={`h-10 rounded-xl text-sm font-semibold transition ${mode === k ? 'bg-white text-[#0a4d68] shadow-sm' : 'text-slate-500'}`}>
            {label}
          </button>
        ))}
      </div>

      <form
        className="mt-4 space-y-3.5 max-h-[min(62vh,520px)] overflow-y-auto pe-1 -me-1"
        onSubmit={(e) => { e.preventDefault(); realAuth(mode); }}
      >
        {mode === 'signup' && (
          <>
            <div>
              <label className="text-xs font-semibold text-slate-500">{t('auth.full_name')} *</label>
              <div className="relative">
                <User className="absolute start-3.5 top-[1.35rem] h-4 w-4 text-slate-400 pointer-events-none" />
                <input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name"
                  className={`${inp} ps-10`} placeholder={t('auth.ph_name')} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">{t('auth.phone')} *</label>
              <input dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel"
                className={inp} placeholder="+90 533 ..." inputMode="tel" />
              <p className="text-[11px] text-slate-400 mt-1">{t('auth.phone_hint')}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">{t('auth.city')}</label>
              <select value={city} onChange={e => setCity(e.target.value)} className={inp}>
                {KKTC_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2.5 text-sm text-slate-700 min-h-11">
              <input type="checkbox" checked={isAgency} onChange={e => setIsAgency(e.target.checked)}
                className="h-4 w-4 rounded accent-[#0a4d68]" />
              {t('auth.is_agency')}
            </label>
            {isAgency && (
              <div>
                <label className="text-xs font-semibold text-slate-500">{t('auth.agency_name')} *</label>
                <input value={agencyName} onChange={e => setAgencyName(e.target.value)} className={inp} />
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-slate-500">{t('auth.unified_note')}</p>
          </>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-500">{t('auth.email')} *</label>
          <div className="relative">
            <Mail className="absolute start-3.5 top-[1.35rem] h-4 w-4 text-slate-400 pointer-events-none" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"
              className={`${inp} ps-10`} placeholder={t('auth.ph_email')} dir="ltr" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">{t('auth.password')} *</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className={`${inp} pe-11`} placeholder={t('auth.ph_password')} dir="ltr" />
            <button type="button" onClick={() => setShowPass(s => !s)}
              className="absolute end-2 top-[0.85rem] h-9 w-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600"
              aria-label="Toggle password">
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {mode === 'signup' && (
          <div>
            <label className="text-xs font-semibold text-slate-500">{t('auth.password_confirm')} *</label>
            <input type={showPass ? 'text' : 'password'} value={password2} onChange={e => setPassword2(e.target.value)}
              autoComplete="new-password" className={inp} dir="ltr" />
          </div>
        )}

        {msg && (
          <p className={`text-xs rounded-2xl px-3 py-2.5 leading-relaxed ${msgOk ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-red-50 text-red-700'}`}>
            {msg}
          </p>
        )}

        {mode === 'signin' && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <button type="button" disabled={busy} onClick={sendPasswordReset}
              className="font-semibold text-[#0a4d68] hover:underline disabled:opacity-50">
              {t('auth.forgot_password')}
            </button>
          </div>
        )}

        <button type="submit" disabled={busy}
          className="w-full h-12 rounded-2xl bg-[#0a4d68] text-white font-semibold disabled:opacity-60 shadow-sm shadow-[#0a4d68]/20 inline-flex items-center justify-center gap-2">
          {busy ? t('common.loading') : (mode === 'signup' ? t('auth.signup') : t('auth.signin'))}
          {!busy && <ArrowRight className="h-4 w-4 rtl:rotate-180" />}
        </button>

        <button type="button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMsg(''); }}
          className="w-full text-center text-sm font-medium text-[#0a4d68] py-1">
          {mode === 'signup' ? t('auth.switch_signin') : t('auth.switch_signup')}
        </button>

        {ALLOW_DEMO_AUTH && (
          <button type="button"
            onClick={() => {
              setAuth({ signedIn: true, studentId: `demo-${Math.random().toString(36).slice(2, 8)}`, email: email || 'user@demo', role: 'landlord' });
              onClose();
            }}
            className="w-full h-11 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm"
          >
            {t('auth.as_demo')}
          </button>
        )}
      </form>
    </Overlay>
  );
}

function SavedView({ t, locale, currency, fx, goListing, auth, setAuthModal, userLoc }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!auth.signedIn) return;
    api('my/saved').then((r) => r.json()).then((d) => setItems(d.items || [])).catch(() => setItems([]));
  }, [auth.signedIn]);

  if (!auth.signedIn) {
    return (
      <div className="container py-16 text-center">
        <p className="text-slate-600 mb-4">{t('contact.gated')}</p>
        <button onClick={() => setAuthModal('signin')} className="h-11 px-5 rounded-xl bg-[#0a4d68] text-white font-semibold">{t('nav.signin')}</button>
      </div>
    );
  }
  if (!items) return <div className="container py-20 text-center text-slate-400">{t('common.loading')}</div>;
  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold text-[#0a3d54] mb-6 flex items-center gap-2"><Heart className="h-6 w-6" /> {t('nav.saved')}</h1>
      {items.length === 0 ? (
        <p className="text-slate-400 text-center py-16">{t('search.no_results')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {items.map((l) => (
            <ListingCard key={l.id} l={l} t={t} locale={locale} currency={currency} fx={fx} onOpen={goListing} userLoc={userLoc} />
          ))}
        </div>
      )}
    </div>
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
                {REPORT_REASONS.map(k => <option key={k} value={k}>{t(`report.reasons.${k}`)}</option>)}
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

function Overlay({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#062636]/55 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className={`bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 w-full relative shadow-2xl shadow-black/20 max-h-[92vh] overflow-hidden ${wide ? 'max-w-lg' : 'max-w-md'}`}
        onClick={e => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute top-4 end-4 z-10 h-9 w-9 rounded-full bg-slate-100 text-slate-500 hover:text-slate-700 flex items-center justify-center" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}
