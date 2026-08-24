'use client';

import { useEffect, useRef, useState } from 'react';
import { CreditCard, ShieldCheck, Lock, ArrowLeft, Sparkles } from 'lucide-react';
import { api, getAccessToken } from '@/lib/api-client';
import { PREMIUM_PLANS } from '@/lib/premium';

const PLAN_STYLE = {
  bronze: { border: 'border-[#f59e0b]', price: 'text-[#ea580c]', tag: 'bg-[#f59e0b]' },
  gold: { border: 'border-[#eab308]', price: 'text-[#ca8a04]', tag: 'bg-[#eab308]' },
  platinum: { border: 'border-[#7c3aed]', price: 'text-[#7c3aed]', tag: 'bg-[#7c3aed]' },
};

function submitShopierForm(actionUrl, fields) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = actionUrl;
  form.style.display = 'none';
  Object.entries(fields || {}).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value == null ? '' : String(value);
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

export function PaymentCheckoutView({ t, auth, setAuthModal, setView, planId, listingId }) {
  const plan = PREMIUM_PLANS[planId] || PREMIUM_PLANS.gold;
  const style = PLAN_STYLE[plan.id] || PLAN_STYLE.gold;
  const [listing, setListing] = useState(null);
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    fetch('/api/payments/shopier/create')
      .then((r) => r.json())
      .then((d) => setConfigured(!!d.configured))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    if (!auth?.signedIn) return undefined;
    let cancelled = false;
    api('my/listings')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const items = d.items || [];
        const found = items.find((l) => l.id === listingId) || items.find((l) => l.status === 'published');
        setListing(found || null);
        if (found?.city) setCity(found.city);
      })
      .catch(() => {});
    api('my/profile')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const p = d.profile || d || {};
        if (p.full_name) setBuyerName(p.full_name);
        if (p.phone_e164) setBuyerPhone(p.phone_e164);
        if (p.email) setBuyerEmail((prev) => prev || p.email);
      })
      .catch(() => {});
    if (auth.email) setBuyerEmail(auth.email);
    return () => { cancelled = true; };
  }, [auth?.signedIn, auth?.email, listingId]);

  const onPay = async (e) => {
    e.preventDefault();
    setError('');
    if (!auth?.signedIn) {
      setAuthModal?.('signin');
      setError(t('pay.signin_required'));
      return;
    }
    if (!listing?.id) {
      setError(t('pay.no_listing'));
      return;
    }
    if (!buyerEmail.trim() || !buyerPhone.trim()) {
      setError(t('pay.fill_contact'));
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/payments/shopier/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        body: JSON.stringify({
          plan: plan.id,
          listing_id: listing.id,
          buyer_name: buyerName.trim(),
          buyer_email: buyerEmail.trim(),
          buyer_phone: buyerPhone.trim(),
          city: city.trim() || listing.city || 'Lefkosa',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const map = {
          shopier_not_configured: t('pay.not_configured'),
          shopier_create_failed: t('pay.err_generic'),
          listing_not_published: t('premium.err_not_published'),
          not_found: t('premium.err_not_found'),
          forbidden: t('premium.err_forbidden'),
          invalid_plan: t('premium.err_plan'),
          auth_required: t('pay.signin_required'),
        };
        setError(map[data.error] || (data.detail === 'phone' ? t('pay.fill_contact') : t('pay.err_generic')));
        setBusy(false);
        return;
      }
      if (!data.shopier?.actionUrl || !data.shopier?.fields) {
        setError(t('pay.err_generic'));
        setBusy(false);
        return;
      }
      if (started.current) return;
      started.current = true;
      submitShopierForm(data.shopier.actionUrl, data.shopier.fields);
    } catch {
      setError(t('pay.err_generic'));
      setBusy(false);
    }
  };

  if (!auth?.signedIn) {
    return (
      <div className="container max-w-lg mx-auto py-10 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-600 mb-4">{t('pay.signin_required')}</p>
          <button type="button" onClick={() => setAuthModal?.('signin')} className="h-11 px-5 rounded-xl bg-[#0a4d68] text-white font-semibold cursor-pointer">
            {t('nav.signin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-12">
      <section className="bg-[linear-gradient(160deg,#0a6b66_0%,#0a4d68_55%,#08304a_100%)] text-white">
        <div className="container max-w-lg mx-auto py-7 px-4">
          <button
            type="button"
            onClick={() => setView?.({ name: 'premium' })}
            className="inline-flex items-center gap-1 text-sm text-white/80 hover:text-white mb-3 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> {t('pay.back')}
          </button>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/80">
            <CreditCard className="h-3.5 w-3.5 text-[#e0a256]" />
            {t('pay.badge')}
          </div>
          <h1 className="ko-display mt-1 text-2xl sm:text-3xl font-bold">{t('pay.title')}</h1>
          <p className="mt-1.5 text-sm text-white/85">{t('pay.subtitle')}</p>
        </div>
      </section>

      <section className="container max-w-lg mx-auto px-4 -mt-2">
        <div className={`mt-4 rounded-2xl border-2 bg-white p-4 shadow-sm ${style.border}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className={`inline-flex rounded-md ${style.tag} px-2 py-0.5 text-[11px] font-bold uppercase text-white`}>
                {t(`premium.${plan.id}.label`)}
              </span>
              <p className="mt-2 text-sm text-slate-600">
                {listing ? `${listing.title} · ${listing.reference_code}` : t('pay.loading_listing')}
              </p>
            </div>
            <div className="text-end">
              <div className={`text-2xl font-bold tabular-nums ${style.price}`}>
                ₺{Number(plan.price_amount).toFixed(2).replace('.', ',')}
              </div>
              <div className="text-[11px] text-slate-400">{plan.duration_days} {t('pay.days')}</div>
            </div>
          </div>
        </div>

        <form onSubmit={onPay} className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0a3d54]">{t('pay.buyer_title')}</h2>
          <label className="block">
            <span className="text-xs text-slate-500">{t('pay.name')}</span>
            <input
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/25"
              autoComplete="name"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">{t('pay.email')}</span>
            <input
              type="email"
              required
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/25"
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">{t('pay.phone')}</span>
            <input
              required
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              placeholder="+90 5xx xxx xx xx"
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/25"
              autoComplete="tel"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">{t('pay.city')}</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/25"
            />
          </label>

          <p className="flex items-start gap-2 text-xs text-slate-500 pt-1">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#0a4d68]" />
            {t('pay.secure_note')}
          </p>

          {configured === false && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t('pay.not_configured_hint')}
            </p>
          )}

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy || !listing}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0a4d68] text-sm font-semibold text-white hover:bg-[#08415c] disabled:opacity-60 cursor-pointer"
          >
            <ShieldCheck className="h-4 w-4 text-[#e0a256]" />
            {busy ? t('pay.redirecting') : t('pay.pay_with_shopier')}
          </button>
        </form>

        <ul className="mt-4 space-y-1.5 text-sm text-slate-600 px-1">
          <li className="flex gap-2"><Sparkles className="h-4 w-4 text-[#e0a256] shrink-0" />{t('pay.fx_instant')}</li>
          <li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-[#0a4d68] shrink-0" />{t('pay.fx_secure')}</li>
        </ul>
      </section>
    </div>
  );
}

export function PaymentResultView({ t, setView, status, orderId, planId, listingRef }) {
  const ok = status === 'success';
  return (
    <div className="container max-w-lg mx-auto py-12 px-4">
      <div className={`rounded-2xl border p-6 text-center ${
        ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
      }`}
      >
        <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${
          ok ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
        }`}
        >
          {ok ? <ShieldCheck className="h-6 w-6" /> : <CreditCard className="h-6 w-6" />}
        </div>
        <h1 className="ko-display text-2xl font-bold text-[#0a3d54]">
          {ok ? t('pay.result_ok') : t('pay.result_fail')}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {ok ? t('pay.result_ok_sub') : t('pay.result_fail_sub')}
        </p>
        {orderId && (
          <p className="mt-2 text-xs text-slate-500 font-mono">{t('pay.order')}: {orderId}</p>
        )}
        {ok && planId && (
          <p className="mt-1 text-sm font-semibold text-[#0a4d68]">
            {t(`premium.${planId}.label`)}
          </p>
        )}
        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          {ok && listingRef && (
            <button
              type="button"
              onClick={() => setView?.({ name: 'listing', ref: listingRef })}
              className="h-11 rounded-xl bg-[#0a4d68] px-5 text-sm font-semibold text-white cursor-pointer"
            >
              {t('premium.view_listing')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setView?.({ name: ok ? 'dashboard' : 'premium' })}
            className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 cursor-pointer"
          >
            {ok ? t('nav.dashboard') : t('pay.try_again')}
          </button>
        </div>
      </div>
    </div>
  );
}
