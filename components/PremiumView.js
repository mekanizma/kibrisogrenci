'use client';

import { useEffect, useState } from 'react';
import { Sparkles, ShieldCheck, Zap, Check, Home } from 'lucide-react';
import { api } from '@/lib/api-client';

const PLANS = [
  {
    id: 'bronze',
    border: 'border-[#f59e0b]',
    tagBg: 'bg-[#f59e0b]',
    priceColor: 'text-[#ea580c]',
    popular: false,
  },
  {
    id: 'gold',
    border: 'border-[#eab308]',
    tagBg: 'bg-[#eab308]',
    priceColor: 'text-[#ca8a04]',
    popular: true,
  },
  {
    id: 'platinum',
    border: 'border-[#7c3aed]',
    tagBg: 'bg-[#7c3aed]',
    priceColor: 'text-[#7c3aed]',
    popular: false,
  },
];

export function PremiumView({ t, auth, setAuthModal, setView }) {
  const [selected, setSelected] = useState('gold');
  const [listingId, setListingId] = useState('');
  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!auth?.signedIn) {
      setListings([]);
      setListingId('');
      return undefined;
    }
    let cancelled = false;
    setLoadingListings(true);
    api('my/listings')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const published = (d.items || []).filter((l) => l.status === 'published');
        setListings(published);
        setListingId((prev) => {
          if (prev && published.some((l) => l.id === prev)) return prev;
          return published[0]?.id || '';
        });
      })
      .catch(() => {
        if (!cancelled) setListings([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingListings(false);
      });
    return () => { cancelled = true; };
  }, [auth?.signedIn]);

  const onSelect = (id) => {
    setSelected(id);
    setNotice('');
  };

  const onContinue = () => {
    setNotice('');

    if (!auth?.signedIn) {
      setAuthModal?.('signin');
      setNotice(t('premium.signin_required'));
      return;
    }
    if (!listingId) {
      setNotice(t('premium.pick_listing'));
      return;
    }

    setView?.({
      name: 'checkout',
      plan: selected,
      listingId,
    });
  };

  const selectedListing = listings.find((l) => l.id === listingId);

  return (
    <div className="pb-10">
      <section className="relative overflow-hidden bg-[linear-gradient(160deg,#0a6b66_0%,#0a4d68_55%,#08304a_100%)] text-white">
        <div className="pointer-events-none absolute -top-16 -end-10 h-48 w-48 rounded-full bg-[#e0a256]/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -start-8 h-40 w-40 rounded-full bg-[#7ec8d4]/15 blur-3xl" />
        <div className="container relative py-8 sm:py-10 text-center max-w-lg mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-white/90 mb-3">
            <Sparkles className="h-3.5 w-3.5 text-[#e0a256]" />
            {t('premium.badge')}
          </div>
          <h1 className="ko-display text-2xl sm:text-3xl font-bold tracking-tight uppercase">
            {t('premium.title')}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-white/85">
            {t('premium.subtitle')}
          </p>
          <div className="mx-auto mt-4 h-px w-16 bg-white/35" />
        </div>
      </section>

      <section className="container max-w-lg mx-auto -mt-1 px-4 sm:px-6">
        {/* Listing picker */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0a3d54]">
            <Home className="h-4 w-4 text-[#0a4d68]" />
            {t('premium.pick_listing_title')}
          </div>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">{t('premium.pick_listing_hint')}</p>

          {!auth?.signedIn ? (
            <button
              type="button"
              onClick={() => setAuthModal?.('signin')}
              className="mt-3 h-11 w-full rounded-xl bg-[#0a4d68] text-sm font-semibold text-white cursor-pointer"
            >
              {t('nav.signin')}
            </button>
          ) : loadingListings ? (
            <p className="mt-3 text-sm text-slate-400">{t('common.loading')}</p>
          ) : listings.length === 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                {t('premium.no_published')}
              </p>
              <button
                type="button"
                onClick={() => setView?.({ name: 'dashboard' })}
                className="h-10 w-full rounded-xl border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
              >
                {t('nav.dashboard')}
              </button>
            </div>
          ) : (
            <select
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
              className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-[#f8fafb] px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#0a4d68]/25 cursor-pointer"
            >
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} ({l.reference_code})
                  {l.premium_tier ? ` · ${String(l.premium_tier).toUpperCase()}` : ''}
                </option>
              ))}
            </select>
          )}

          {selectedListing?.premium_tier && (
            <p className="mt-2 text-xs font-medium text-[#0a4d68]">
              {t('premium.current_active', { plan: t(`premium.${selectedListing.premium_tier}.label`) })}
            </p>
          )}
        </div>

        {/* Plans */}
        <div className="space-y-4 pt-5">
          {PLANS.map((plan) => {
            const features = t(`premium.${plan.id}.features`);
            const featureList = Array.isArray(features) ? features : [];
            const isSelected = selected === plan.id;
            const savings = t(`premium.${plan.id}.savings`);
            const hasSavings = savings && !String(savings).startsWith('premium.');

            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => onSelect(plan.id)}
                className={`relative w-full text-start rounded-2xl border-2 bg-white p-4 pt-5 shadow-[0_12px_36px_-20px_rgba(10,61,84,0.35)] transition-all cursor-pointer ${plan.border} ${
                  isSelected ? 'ring-2 ring-offset-2 ring-[#0a4d68]/35 scale-[1.01]' : 'hover:shadow-md'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 end-3 rounded-full bg-[#dc2626] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                    {t('premium.popular')}
                  </span>
                )}

                <span
                  className={`absolute top-0 start-3 -translate-y-1/2 rounded-md ${plan.tagBg} px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white`}
                >
                  {t(`premium.${plan.id}.label`)}
                </span>

                <div className="mt-1 flex items-start justify-between gap-3">
                  <ul className="min-w-0 flex-1 space-y-1 pe-1">
                    {featureList.map((f) => (
                      <li key={f} className="flex gap-1.5 text-[13px] leading-snug text-slate-700">
                        <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${plan.priceColor}`} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="shrink-0 text-end">
                    <div className="text-xs text-slate-400 line-through tabular-nums">
                      {t(`premium.${plan.id}.old_price`)}
                    </div>
                    <div className={`text-xl sm:text-2xl font-bold tabular-nums leading-tight ${plan.priceColor}`}>
                      {t(`premium.${plan.id}.price`)}
                    </div>
                    {hasSavings && (
                      <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-[#dc2626]">
                        {savings}
                      </div>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[#0a4d68]">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0a4d68] text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                    {t('premium.selected')}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-[#0a4d68]" />
            {t('premium.trust')}
          </span>
        </p>

        <button
          type="button"
          onClick={onContinue}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0a4d68] text-sm font-semibold text-white shadow-sm shadow-[#0a4d68]/25 hover:bg-[#08415c] active:scale-[0.99] transition-colors cursor-pointer"
        >
          <Zap className="h-4 w-4 text-[#e0a256]" />
          {t('premium.cta')}
        </button>

        {notice && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-sm text-amber-800">
            {notice}
          </p>
        )}

        <p className="mt-4 text-center text-xs text-slate-500">
          {t('premium.more_info')}
        </p>
      </section>

      <section className="mt-8">
        <div className="bg-[#0a6b66] text-center text-[11px] sm:text-xs font-semibold tracking-wide text-white/95 py-2.5 px-4">
          {t('premium.strip')}
        </div>
        <div className="bg-[linear-gradient(180deg,#f6f4f0_0%,#eef4f7_100%)] px-4 py-8 text-center">
          <div className="mx-auto max-w-md">
            <h2 className="ko-display text-xl sm:text-2xl font-bold text-[#0a3d54] uppercase tracking-tight">
              {t('premium.bottom_title')}
            </h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {t('premium.bottom_sub')}
            </p>
        <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={() => setView?.({ name: 'home' })}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                {t('premium.close')}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
