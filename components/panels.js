'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Plus, Eye, Phone, CreditCard, CheckCircle2, XCircle,
  ShieldAlert, Activity, Building2, Send, Bot,
  BadgeCheck, AlertTriangle, Banknote, X, ImagePlus,
  Pencil, Trash2, MapPin, Flag, Pause, Play, CircleSlash,
} from 'lucide-react';
import { api as apiFetch, getAccessToken } from '@/lib/api-client';
import { createClient } from '@/lib/supabase/client';
import { nearestCity, requestUserLocation } from '@/lib/geo-client';
import { KKTC_CITIES } from '@/lib/universities';

const AnalyticsChart = dynamic(() => import('@/components/AnalyticsChart'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-slate-100" />,
});

const SYMBOL = { TRY: '₺', GBP: '£', USD: '$', EUR: '€' };
const money = (p, locale) => `${SYMBOL[p.currency] || ''}${Number(p.amount).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB')}`;
const api = async (p, o = {}) => {
  const headers = { ...(o.headers || {}) };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (o.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await apiFetch(p, { ...o, headers });
  return res.json();
};

const AMENITY_KEYS = [
  'wifi', 'ac', 'parking', 'pool', 'gym', 'washing_machine', 'balcony',
  'elevator', 'security', 'garden', 'study_room', 'furnished_kitchen', 'sea_view',
];

const EMPTY_FORM = {
  title: '',
  description: '',
  property_type: 'apartment',
  bedrooms: '1',
  bathrooms: '1',
  size_sqm: '',
  max_occupants: '',
  furnished: true,
  bills_included: false,
  bills_note: '',
  gender_preference: 'any',
  price_amount: '',
  price_currency: 'GBP',
  deposit_amount: '',
  deposit_currency: 'GBP',
  city: 'Girne',
  neighbourhood: '',
  address_private: '',
  university_id: '',
  university_ids: [],
  available_from: '',
  minimum_stay_months: '6',
  phone_e164: '',
  display_name: '',
  amenities: [],
};

const STATUS_STYLE = {
  published: 'bg-[#dcfce7] text-[#15803d]',
  pending_review: 'bg-amber-50 text-amber-700',
  draft: 'bg-slate-100 text-slate-500',
  rejected: 'bg-red-50 text-red-600',
  paused: 'bg-sky-50 text-sky-800',
  rented: 'bg-violet-50 text-violet-800',
  expired: 'bg-slate-100 text-slate-500',
};
function StatusPill({ s, t }) {
  const label = {
    published: t('dash.published'),
    pending_review: t('dash.pending'),
    draft: t('dash.draft'),
    rejected: t('dash.rejected'),
    paused: t('dash.paused'),
    rented: t('dash.closed'),
    expired: t('dash.expired'),
  }[s] || s;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s] || 'bg-slate-100 text-slate-600'}`}>{label}</span>;
}

async function uploadListingPhotos(files) {
  const supabase = createClient();
  const token = getAccessToken();
  if (!supabase || !token || !files?.length) return [];
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) throw new Error('auth');

  const keys = [];
  for (let i = 0; i < Math.min(files.length, 20); i++) {
    const file = files[i];
    if (!file.type.startsWith('image/')) continue;
    if (file.size > 10 * 1024 * 1024) continue;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${uid}/${Date.now()}-${i}.${ext}`;
    const { error } = await supabase.storage.from('listing-photos').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    keys.push({ storage_key: path, sort_order: i });
  }
  return keys;
}

// ======================= LANDLORD DASHBOARD =======================
export function DashboardView({ t, locale, config, auth, requestLocation, userLoc }) {
  const [tab, setTab] = useState('listings');
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [inquiries, setInquiries] = useState(null);
  const [reports, setReports] = useState(null);
  const [billing, setBilling] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [existingPhotoKeys, setExistingPhotoKeys] = useState([]);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [geoHint, setGeoHint] = useState('');

  const load = () => api('my/listings').then(setData);
  useEffect(() => {
    if (!auth?.signedIn) return;
    load();
  }, [auth?.signedIn]);

  useEffect(() => {
    if (!auth?.signedIn) return;
    if (tab === 'analytics' && !analytics) api('my/analytics').then(setAnalytics);
    if (tab === 'inquiries' && inquiries == null) api('my/inquiries').then((d) => setInquiries(d.items || []));
    if (tab === 'reports' && reports == null) api('my/reports').then((d) => setReports(d.items || []));
    if (tab === 'billing' && !billing) api('my/billing').then(setBilling);
  }, [auth?.signedIn, tab]);

  useEffect(() => {
    const urls = photoFiles.map((f) => URL.createObjectURL(f));
    setPhotoPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photoFiles]);

  useEffect(() => {
    if (!creating || editingId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        let geo = userLoc;
        if (!geo?.lat) {
          geo = requestLocation
            ? await requestLocation().catch(() => null)
            : await requestUserLocation().catch(() => null);
        }
        if (cancelled || !geo?.lat) return;
        const city = nearestCity(geo.lat, geo.lng);
        if (city) {
          setForm((s) => (s.city === city ? s : { ...s, city }));
          setGeoHint(city);
        }
      } catch {
        /* permission denied — form still usable */
      }
    })();
    return () => { cancelled = true; };
  }, [creating, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const toggleAmenity = (key) => {
    setForm((s) => {
      const has = s.amenities.includes(key);
      return { ...s, amenities: has ? s.amenities.filter((a) => a !== key) : [...s.amenities, key] };
    });
  };
  const toggleUniversity = (id) => {
    setForm((s) => {
      const cur = Array.isArray(s.university_ids) ? s.university_ids : [];
      const has = cur.includes(id);
      const next = has ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...s, university_ids: next, university_id: next[0] || '' };
    });
  };

  const onPickPhotos = (e) => {
    const picked = Array.from(e.target.files || []);
    setPhotoFiles((prev) => [...prev, ...picked].slice(0, 20));
    e.target.value = '';
  };

  const removePhoto = (idx) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const validate = (draft) => {
    if (draft) return null;
    if (!form.title.trim() || form.title.trim().length < 5) return t('dash.err_title');
    if (!form.description.trim() || form.description.trim().length < 20) return t('dash.err_description');
    if (!(Number(form.price_amount) > 0)) return t('dash.err_price');
    if (!form.city.trim()) return t('dash.err_city');
    if (!form.neighbourhood.trim()) return t('dash.err_neighbourhood');
    if (!form.address_private.trim()) return t('dash.err_address');
    if (!form.phone_e164.trim()) return t('dash.err_phone');
    if (photoFiles.length < 1 && existingPhotoKeys.length < 1) return t('dash.err_photos');
    return null;
  };

  const resetForm = () => {
    setCreating(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setPhotoFiles([]);
    setExistingPhotoKeys([]);
    setGeoHint('');
  };

  const startEdit = async (id) => {
    setBusy(true);
    setToast('');
    try {
      const res = await api(`my/listings/${id}`);
      if (res.error || !res.item) { setToast(t('dash.err_generic')); setBusy(false); return; }
      const it = res.item;
      setForm({
        ...EMPTY_FORM,
        title: it.title || '',
        description: it.description || '',
        property_type: it.property_type || 'apartment',
        bedrooms: String(it.bedrooms ?? 1),
        bathrooms: String(it.bathrooms ?? 1),
        size_sqm: it.size_sqm != null ? String(it.size_sqm) : '',
        max_occupants: it.max_occupants != null ? String(it.max_occupants) : '',
        furnished: it.furnished !== false,
        bills_included: !!it.bills_included,
        bills_note: it.bills_note || '',
        gender_preference: it.gender_preference || 'any',
        price_amount: it.price_amount != null ? String(it.price_amount) : '',
        price_currency: it.price_currency || 'GBP',
        deposit_amount: it.deposit_amount != null ? String(it.deposit_amount) : '',
        deposit_currency: it.deposit_currency || 'GBP',
        city: it.city || 'Girne',
        neighbourhood: it.neighbourhood || '',
        address_private: it.address_private || '',
        university_id: (it.university_ids && it.university_ids[0]) || it.university_id || '',
        university_ids: Array.isArray(it.university_ids)
          ? it.university_ids
          : (it.university_id ? [it.university_id] : []),
        available_from: it.available_from ? String(it.available_from).slice(0, 10) : '',
        minimum_stay_months: it.minimum_stay_months != null ? String(it.minimum_stay_months) : '6',
        amenities: it.amenities || [],
      });
      setExistingPhotoKeys(it.photos || []);
      setPhotoFiles([]);
      setEditingId(id);
      setCreating(true);
    } catch {
      setToast(t('dash.err_generic'));
    }
    setBusy(false);
  };

  const removeListing = async (id) => {
    if (!confirm(t('dash.confirm_delete'))) return;
    const res = await api(`my/listings/${id}`, { method: 'DELETE' });
    if (res.error) { setToast(t('dash.err_generic')); return; }
    setToast(t('dash.deleted'));
    load();
    setTimeout(() => setToast(''), 3000);
  };

  const ownerAction = async (id, action) => {
    const confirms = {
      pause: t('dash.confirm_pause'),
      close: t('dash.confirm_close'),
      resume: null,
      reopen: t('dash.confirm_reopen'),
    };
    const conf = confirms[action];
    if (conf && !confirm(conf)) return;
    setBusy(true);
    const res = await api(`my/listings/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (res.error) {
      setToast(t('dash.err_generic'));
      setTimeout(() => setToast(''), 3000);
      return;
    }
    const okMsg = {
      pause: t('dash.paused_ok'),
      resume: t('dash.resumed_ok'),
      close: t('dash.closed_ok'),
      reopen: t('dash.reopened_ok'),
    }[action] || t('dash.saved_ok');
    setToast(okMsg);
    load();
    setTimeout(() => setToast(''), 3000);
  };

  const submit = async (draft) => {
    const err = validate(draft);
    if (err) { setToast(err); return; }
    setBusy(true);
    setToast('');
    try {
      let photos = [...existingPhotoKeys.map((k, i) => ({ storage_key: k, sort_order: i }))];
      if (photoFiles.length) {
        const uploaded = await uploadListingPhotos(photoFiles);
        if (!draft && uploaded.length < 1 && photos.length < 1) {
          setToast(t('dash.err_photos_upload'));
          setBusy(false);
          return;
        }
        photos = [...photos, ...uploaded.map((p, i) => ({ ...p, sort_order: photos.length + i }))];
      }
      const payload = {
        ...form,
        bedrooms: Number(form.bedrooms) || 0,
        bathrooms: Number(form.bathrooms) || 1,
        size_sqm: form.size_sqm ? Number(form.size_sqm) : null,
        max_occupants: form.max_occupants ? Number(form.max_occupants) : null,
        minimum_stay_months: form.minimum_stay_months ? Number(form.minimum_stay_months) : null,
        university_id: (form.university_ids && form.university_ids[0]) || form.university_id || null,
        university_ids: Array.isArray(form.university_ids) ? form.university_ids : [],
        photos,
        draft,
        resubmit: !draft,
      };
      const res = editingId
        ? await api(`my/listings/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api('my/listings', { method: 'POST', body: JSON.stringify(payload) });
      if (res.error === 'quota_exceeded') { setToast(t('dash.err_quota')); setBusy(false); return; }
      if (res.error === 'auth_required') { setToast(t('dash.err_auth')); setBusy(false); return; }
      if (res.error) { setToast(t('dash.err_generic')); setBusy(false); return; }
      setToast(draft ? t('dash.draft_saved') : t('dash.submitted'));
      resetForm();
      load();
      setTimeout(() => setToast(''), 3500);
    } catch (e) {
      setToast(t('dash.err_generic'));
    }
    setBusy(false);
  };

  if (!auth?.signedIn) {
    return (
      <div className="container py-16 text-center text-slate-500">
        {t('dash.signin_required')}
      </div>
    );
  }

  const tabs = [
    ['listings', t('dash.my_listings')],
    ['analytics', t('dash.analytics')],
    ['reports', t('dash.reports')],
    ['inquiries', t('dash.inquiries')],
    ['billing', t('dash.billing')],
  ];
  const selCls = 'w-full h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/30';
  const labelCls = 'text-xs font-semibold text-slate-500 mb-1 block';
  const unis = config?.all_universities || config?.universities || [];
  const cities = [
    ...KKTC_CITIES,
    ...(config?.cities || []).filter((c) => c && !KKTC_CITIES.includes(c)),
  ];

  return (
    <div className="container py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[#0a3d54]">{t('dash.title')}</h1>
        {data?.quota && (
          <div className="text-sm text-slate-500">{t('dash.quota')}: <span className="font-bold text-[#0a4d68]">{data.quota.used}/{data.quota.total || '—'}</span> {data.quota.package ? `(${data.quota.package})` : ''}</div>
        )}
      </div>
      {toast && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${
          /başarısız|gerekli|doldu|olmalı|girin|ekleyin|failed|required|exceeded|must|Enter|Add|Select|Could|Quota|Sign/i.test(toast)
            ? 'bg-amber-50 text-amber-800'
            : 'bg-[#dcfce7] text-[#15803d]'
        }`}>{toast}</div>
      )}

      {data?.verification_status === 'verified' && (
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 shrink-0" /> {t('admin.verified')} — {t('listing.verified')}
        </div>
      )}
      {data?.verification_status === 'pending' && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('admin.verify_pending')} · {t('common.verified_soon')}
        </div>
      )}
      {data?.verification_status === 'rejected' && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
          {t('admin.verify_rejected')}
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-[#0a4d68] text-[#0a4d68]' : 'border-transparent text-slate-500'}`}>{label}</button>
        ))}
      </div>

      {tab === 'listings' && (
        <div>
          {!creating && (
            <button onClick={() => { setEditingId(null); setForm({ ...EMPTY_FORM }); setExistingPhotoKeys([]); setCreating(true); }} className="mb-4 inline-flex items-center gap-2 h-11 rounded-xl bg-[#0a4d68] px-4 text-white font-semibold"><Plus className="h-5 w-5" /> {t('dash.new_listing')}</button>
          )}
          {creating && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 mb-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <h3 className="font-bold text-[#0a3d54] text-lg">{editingId ? t('dash.edit_title') : t('dash.create_title')}</h3>
                <button type="button" onClick={resetForm} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
              </div>

              <div className="space-y-5">
                <section>
                  <h4 className="text-sm font-bold text-slate-700 mb-3">{t('dash.section_basic')}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{t('dash.field_title')} *</label>
                      <input className={selCls} value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder={t('dash.ph_title')} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{t('dash.field_description')} *</label>
                      <textarea
                        className="w-full min-h-[110px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/30"
                        value={form.description}
                        onChange={(e) => setField('description', e.target.value)}
                        placeholder={t('dash.ph_description')}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_type')}</label>
                      <select className={selCls} value={form.property_type} onChange={(e) => setField('property_type', e.target.value)}>
                        {['apartment', 'studio', 'room', 'house'].map((p) => <option key={p} value={p}>{t(`ptype.${p}`)}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{t('dash.field_universities')}</label>
                      <p className="text-[11px] text-slate-400 mb-2">{t('dash.field_universities_hint')}</p>
                      <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-[#f8fafb] p-2.5">
                        {unis.map((u) => {
                          const selected = (form.university_ids || []).includes(u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => toggleUniversity(u.id)}
                              className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs font-semibold transition-colors ${selected ? 'border-[#0a4d68] bg-[#0a4d68] text-white' : 'border-slate-200 bg-white text-[#0a3d54] hover:border-[#0a4d68]/40'}`}
                            >
                              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${selected ? 'bg-white/20' : 'bg-[#0a4d68]/10 text-[#0a4d68]'}`}>
                                {u.short || '—'}
                              </span>
                              <span className="truncate">{locale === 'tr' ? (u.name_tr || u.name_en) : (u.name_en || u.name_tr)}</span>
                            </button>
                          );
                        })}
                      </div>
                      {(form.university_ids || []).length > 0 && (
                        <div className="mt-1.5 text-[11px] text-slate-500">
                          {(form.university_ids || []).length} {t('dash.universities_selected')}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_bedrooms')}</label>
                      <input className={selCls} type="number" min="0" value={form.bedrooms} onChange={(e) => setField('bedrooms', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_bathrooms')}</label>
                      <input className={selCls} type="number" min="1" value={form.bathrooms} onChange={(e) => setField('bathrooms', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_size')}</label>
                      <input className={selCls} type="number" min="1" value={form.size_sqm} onChange={(e) => setField('size_sqm', e.target.value)} placeholder="m²" />
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_occupants')}</label>
                      <input className={selCls} type="number" min="1" value={form.max_occupants} onChange={(e) => setField('max_occupants', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_gender')}</label>
                      <select className={selCls} value={form.gender_preference} onChange={(e) => setField('gender_preference', e.target.value)}>
                        {['any', 'male', 'female'].map((g) => <option key={g} value={g}>{t(`gender.${g}`)}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end gap-4 pb-1 flex-wrap">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={form.furnished} onChange={(e) => setField('furnished', e.target.checked)} />
                        {t('search.furnished')}
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={form.bills_included} onChange={(e) => setField('bills_included', e.target.checked)} />
                        {t('search.bills_included')}
                      </label>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-bold text-slate-700 mb-3">{t('dash.section_price')}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t('dash.field_price')} *</label>
                      <input className={selCls} type="number" min="1" value={form.price_amount} onChange={(e) => setField('price_amount', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_currency')}</label>
                      <select className={selCls} value={form.price_currency} onChange={(e) => setField('price_currency', e.target.value)}>
                        {['GBP', 'TRY', 'USD', 'EUR'].map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_deposit')}</label>
                      <input className={selCls} type="number" min="0" value={form.deposit_amount} onChange={(e) => setField('deposit_amount', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_deposit_currency')}</label>
                      <select className={selCls} value={form.deposit_currency} onChange={(e) => setField('deposit_currency', e.target.value)}>
                        {['GBP', 'TRY', 'USD', 'EUR'].map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_available')}</label>
                      <input className={selCls} type="date" value={form.available_from} onChange={(e) => setField('available_from', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_min_stay')}</label>
                      <input className={selCls} type="number" min="1" value={form.minimum_stay_months} onChange={(e) => setField('minimum_stay_months', e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{t('dash.field_bills_note')}</label>
                      <input className={selCls} value={form.bills_note} onChange={(e) => setField('bills_note', e.target.value)} placeholder={t('dash.ph_bills_note')} />
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-bold text-slate-700 mb-3">{t('dash.section_location')}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t('dash.field_city')} *</label>
                      <select className={selCls} value={form.city} onChange={(e) => setField('city', e.target.value)}>
                        {cities.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      {geoHint && (
                        <p className="mt-1.5 flex items-center gap-1 text-xs text-[#0a4d68]">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {t('geo.suggest_city')}: {geoHint}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_neighbourhood')} *</label>
                      <input className={selCls} value={form.neighbourhood} onChange={(e) => setField('neighbourhood', e.target.value)} placeholder={t('dash.ph_neighbourhood')} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{t('dash.field_address')} *</label>
                      <input className={selCls} value={form.address_private} onChange={(e) => setField('address_private', e.target.value)} placeholder={t('dash.ph_address')} />
                      <p className="text-[11px] text-slate-400 mt-1">{t('dash.address_note')}</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-bold text-slate-700 mb-3">{t('dash.section_contact')}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t('dash.field_display_name')}</label>
                      <input className={selCls} value={form.display_name} onChange={(e) => setField('display_name', e.target.value)} placeholder={t('dash.ph_display_name')} />
                    </div>
                    <div>
                      <label className={labelCls}>{t('dash.field_phone')} *</label>
                      <input className={selCls} dir="ltr" value={form.phone_e164} onChange={(e) => setField('phone_e164', e.target.value)} placeholder="+90 533 ..." />
                      <p className="text-[11px] text-slate-400 mt-1">{t('dash.phone_note')}</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-bold text-slate-700 mb-3">{t('dash.section_amenities')}</h4>
                  <div className="flex flex-wrap gap-2">
                    {AMENITY_KEYS.map((key) => {
                      const on = form.amenities.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleAmenity(key)}
                          className={`h-9 px-3 rounded-lg text-xs font-semibold border ${on ? 'bg-[#0a4d68] text-white border-[#0a4d68]' : 'bg-white text-slate-600 border-slate-200'}`}
                        >
                          {t(`amenity.${key}`)}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-bold text-slate-700 mb-3">{t('dash.section_photos')} *</h4>
                  <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 cursor-pointer hover:border-[#0a4d68]/40">
                    <ImagePlus className="h-8 w-8 text-[#0a4d68]" />
                    <span className="text-sm font-semibold text-slate-700">{t('dash.add_photos')}</span>
                    <span className="text-xs text-slate-400 text-center">{t('dash.photos_hint')}</span>
                    {existingPhotoKeys.length > 0 && (
                      <span className="text-xs text-[#0a4d68] font-medium">{t('dash.existing_photos', { n: existingPhotoKeys.length })}</span>
                    )}
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onPickPhotos} />
                  </label>
                  {photoPreviews.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {photoPreviews.map((src, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200">
                          <img src={src} alt="" className="h-full w-full object-cover" />
                          <button type="button" onClick={() => removePhoto(i)} className="absolute top-1 end-1 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button disabled={busy} onClick={() => submit(false)} className="h-11 rounded-xl bg-[#0a4d68] px-4 text-white font-semibold disabled:opacity-60">
                    {busy ? t('common.loading') : t('dash.submit_review')}
                  </button>
                  <button disabled={busy} onClick={() => submit(true)} className="h-11 rounded-xl border border-slate-200 px-4 text-slate-600 font-semibold disabled:opacity-60">
                    {t('dash.save_draft')}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {(data?.items || []).map((l) => (
              <div key={l.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <img src={l.photo || '/logo-icon.png'} alt="" className="h-16 w-24 rounded-lg object-cover shrink-0 bg-slate-100" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 truncate flex items-center gap-2 flex-wrap">
                      <span className="truncate">{l.title}</span>
                      {l.premium_tier && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          l.premium_tier === 'platinum' ? 'bg-[#7c3aed] text-white'
                            : l.premium_tier === 'gold' ? 'bg-[#eab308] text-[#422006]'
                              : 'bg-[#f59e0b] text-white'
                        }`}
                        >
                          {l.premium_tier}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{t('dash.ref')}: {l.reference_code} · {l.city} · {money(l.price, locale)}</div>
                    {l.status === 'rejected' && l.rejection_reason && (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 whitespace-pre-wrap leading-relaxed">
                        <div className="font-bold text-amber-800 mb-0.5">{t('dash.admin_message')}</div>
                        <div className="mb-1.5 text-amber-900/80">{t('dash.admin_message_cta')}</div>
                        {l.rejection_reason}
                      </div>
                    )}
                    <div className="flex sm:hidden items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                      <span className="flex items-center gap-1" title={t('dash.views')}>
                        <Eye className="h-3.5 w-3.5" /> {l.view_count ?? 0} {t('dash.views')}
                      </span>
                      <span className="flex items-center gap-1" title={t('dash.reveals')}>
                        <Phone className="h-3.5 w-3.5" /> {l.contact_reveal_count ?? 0}
                      </span>
                      {(l.open_reports > 0 || l.report_count > 0) && (
                        <span className="flex items-center gap-1 text-amber-700 font-semibold">
                          <Flag className="h-3.5 w-3.5" /> {l.open_reports || l.report_count} {t('dash.reports')}
                        </span>
                      )}
                      <StatusPill s={l.status} t={t} />
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1 font-medium text-slate-700" title={t('dash.views')}>
                    <Eye className="h-4 w-4" /> {l.view_count ?? 0}
                  </span>
                  <span className="flex items-center gap-1" title={t('dash.reveals')}>
                    <Phone className="h-4 w-4" /> {l.contact_reveal_count ?? 0}
                  </span>
                  {(l.open_reports > 0 || l.report_count > 0) && (
                    <span className="flex items-center gap-1 text-amber-700 font-semibold" title={t('dash.reports')}>
                      <Flag className="h-4 w-4" /> {l.open_reports || l.report_count}
                    </span>
                  )}
                </div>
                <div className="hidden sm:block"><StatusPill s={l.status} t={t} /></div>
                <div className="flex flex-wrap gap-2 shrink-0 w-full sm:w-auto justify-stretch sm:justify-end">
                  {l.status === 'published' && (
                    <button type="button" disabled={busy} onClick={() => ownerAction(l.id, 'pause')}
                      className="h-9 flex-1 sm:flex-none px-3 rounded-lg border border-sky-200 bg-sky-50 text-sm font-semibold text-sky-800 inline-flex items-center justify-center gap-1 disabled:opacity-50">
                      <Pause className="h-3.5 w-3.5" /> {t('dash.pause')}
                    </button>
                  )}
                  {l.status === 'paused' && (
                    <button type="button" disabled={busy} onClick={() => ownerAction(l.id, 'resume')}
                      className="h-9 flex-1 sm:flex-none px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800 inline-flex items-center justify-center gap-1 disabled:opacity-50">
                      <Play className="h-3.5 w-3.5" /> {t('dash.resume')}
                    </button>
                  )}
                  {['published', 'paused'].includes(l.status) && (
                    <button type="button" disabled={busy} onClick={() => ownerAction(l.id, 'close')}
                      className="h-9 flex-1 sm:flex-none px-3 rounded-lg border border-violet-200 bg-violet-50 text-sm font-semibold text-violet-800 inline-flex items-center justify-center gap-1 disabled:opacity-50">
                      <CircleSlash className="h-3.5 w-3.5" /> {t('dash.close_listing')}
                    </button>
                  )}
                  {['rented', 'expired'].includes(l.status) && (
                    <button type="button" disabled={busy} onClick={() => ownerAction(l.id, 'reopen')}
                      className="h-9 flex-1 sm:flex-none px-3 rounded-lg border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-900 inline-flex items-center justify-center gap-1 disabled:opacity-50">
                      <Play className="h-3.5 w-3.5" /> {t('dash.reopen')}
                    </button>
                  )}
                  {['draft', 'rejected', 'paused', 'rented', 'expired', 'published', 'pending_review'].includes(l.status) && (
                    <button type="button" onClick={() => startEdit(l.id)} className="h-9 flex-1 sm:flex-none px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center justify-center gap-1">
                      <Pencil className="h-3.5 w-3.5" /> {t('dash.edit')}
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => removeListing(l.id)}
                    className="h-9 flex-1 sm:flex-none px-3 rounded-lg border border-red-100 text-sm font-semibold text-red-600 inline-flex items-center justify-center gap-1 disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" /> {t('dash.delete')}
                  </button>
                </div>
              </div>
            ))}
            {(!data?.items || data.items.length === 0) && <p className="text-slate-400 text-center py-10">{t('dash.empty')}</p>}
          </div>
        </div>
      )}

      {tab === 'analytics' && analytics && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              [t('dash.views'), analytics.totals?.views ?? 0],
              [t('dash.reveals'), analytics.totals?.reveals ?? 0],
              [t('dash.reports_open'), analytics.totals?.reports_open ?? 0],
              [t('dash.my_listings'), analytics.totals?.listings ?? 0],
            ].map(([label, val]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
                <div className="text-2xl font-bold text-[#0a3d54] mt-1 tabular-nums">{val}</div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold text-[#0a3d54] mb-4">{t('dash.analytics')} · {t('dash.views')} / {t('dash.reveals')}</h3>
            <AnalyticsChart data={analytics.trend || []} />
          </div>
          {(analytics.listings || []).length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 text-sm font-bold text-[#0a3d54]">{t('dash.per_listing')}</div>
              <ul className="divide-y divide-slate-100">
                {analytics.listings.map((l) => (
                  <li key={l.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{l.title}</div>
                      <div className="text-xs text-slate-400">#{l.reference_code}</div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {l.view_count} {t('dash.views')}</span>
                      <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {l.contact_reveal_count} {t('dash.reveals')}</span>
                      <span className={`inline-flex items-center gap-1 ${l.open_reports ? 'text-amber-700 font-semibold' : ''}`}>
                        <Flag className="h-3.5 w-3.5" /> {l.open_reports} {t('dash.reports')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{t('dash.reports_hint')}</p>
          {(reports || []).map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 truncate">
                    {r.title || r.ref} <span className="text-xs text-slate-400 font-normal">· #{r.ref}</span>
                  </div>
                  <div className="text-sm text-amber-800 font-medium mt-1">
                    {t(`report.reasons.${r.reason}`) !== `report.reasons.${r.reason}`
                      ? t(`report.reasons.${r.reason}`)
                      : r.reason}
                    {r.count > 1 ? ` · ×${r.count}` : ''}
                  </div>
                  {r.detail && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{r.detail}</p>}
                  {r.created_at && (
                    <div className="text-[11px] text-slate-400 mt-2">
                      {new Date(r.created_at).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB')}
                    </div>
                  )}
                </div>
                <span className={`shrink-0 text-xs rounded-full px-2.5 py-1 font-semibold ${
                  r.status === 'open' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500'
                }`}>
                  {r.status === 'open' ? t('dash.report_open') : t('dash.report_resolved')}
                </span>
              </div>
            </div>
          ))}
          {reports && reports.length === 0 && <p className="text-slate-400 text-center py-10">{t('dash.reports_empty')}</p>}
          {reports == null && <p className="text-slate-400 text-center py-10">{t('common.loading')}</p>}
        </div>
      )}

      {tab === 'inquiries' && (
        <div className="space-y-3">
          {(inquiries || []).map((i) => (
            <div key={i.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-800">{i.from} <span className="text-xs text-slate-400">· {i.ref}</span></div>
                <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${i.source === 'whatsapp' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-slate-100 text-slate-500'}`}>{i.source}</span>
              </div>
              <p className="text-sm text-slate-600 mt-1">{i.message}</p>
            </div>
          ))}
          {inquiries && inquiries.length === 0 && <p className="text-slate-400 text-center py-10">{t('dash.empty')}</p>}
        </div>
      )}

      {tab === 'billing' && billing && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold text-[#0a3d54] mb-3">{t('dash.billing')}</h3>
            {billing.subscription ? (
              <div className="rounded-xl bg-[#e8f2f6] p-4 mb-3">
                <div className="text-sm text-slate-500">{billing.subscription.package} · {billing.subscription.status}</div>
                <div className="text-lg font-bold text-[#0a4d68]">{billing.subscription.listings_used}/{billing.subscription.listings_total} {t('dash.used')}</div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 mb-3">{t('dash.no_subscription')}</p>
            )}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="font-semibold text-slate-700 flex items-center gap-2 mb-2"><Banknote className="h-4 w-4" /> {t('dash.bank_transfer')}</div>
              <div className="text-sm text-slate-600 space-y-1">
                <div>{billing.bank_instructions?.bank}</div>
                <div dir="ltr" className="font-mono text-xs">{billing.bank_instructions?.iban}</div>
                <div>Ref: <span className="font-bold text-[#0a4d68]">{billing.bank_instructions?.reference}</span></div>
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">{t('dash.bank_note')}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold text-[#0a3d54] mb-3">{t('admin.payments')}</h3>
            <div className="space-y-2">
              {(billing.premium_orders || []).map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm gap-2">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold text-[#0a4d68]">Shopier</span>
                    {' · '}{String(o.plan_id || '').toUpperCase()}
                    {o.listing_ref ? ` · ${o.listing_ref}` : ''}
                    {' · '}{money({ amount: o.amount, currency: o.currency }, locale)}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${o.status === 'paid' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-amber-50 text-amber-700'}`}>{o.status}</span>
                </div>
              ))}
              {(billing.invoices || []).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm">
                  <span>{inv.package || inv.bank_reference} · {money({ amount: inv.amount, currency: inv.currency }, locale)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${inv.status === 'paid' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-amber-50 text-amber-700'}`}>{inv.status}</span>
                </div>
              ))}
              {(!billing.premium_orders?.length && !billing.invoices?.length) && (
                <p className="text-slate-400 text-sm">{t('admin.no_payments')}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================= ADMIN =======================
function AdminReviewDetail({ t, locale, listingId, onClose, onAct }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItem(null);
    setMessage('');
    setErr('');
    api(`admin/listings/${listingId}`)
      .then((r) => {
        if (cancelled) return;
        if (r.error || !r.item) setErr(t('admin.no_items'));
        else setItem(r.item);
      })
      .catch(() => { if (!cancelled) setErr(t('admin.no_items')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [listingId, t]);

  const presets = [
    ['preset_price', t('admin.preset_price')],
    ['preset_photos', t('admin.preset_photos')],
    ['preset_address', t('admin.preset_address')],
    ['preset_desc', t('admin.preset_desc')],
    ['preset_contact', t('admin.preset_contact')],
  ];

  const appendPreset = (text) => {
    setMessage((m) => (m ? `${m.trim()}\n• ${text}` : `• ${text}`));
  };

  const run = async (action) => {
    if (action !== 'approve' && !message.trim()) {
      setErr(t('admin.reason_required'));
      return;
    }
    if (action === 'approve' && !window.confirm(t('admin.approve_confirm'))) return;
    setBusy(true);
    setErr('');
    try {
      await onAct(action, message.trim());
      onClose();
    } catch {
      setErr(t('dash.err_generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label={t('admin.close')} onClick={onClose} />
      <div className="relative w-full sm:max-w-3xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#f6f4f0] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-[#f6f4f0]/95 backdrop-blur px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('admin.detail_title')}</div>
            <div className="font-bold text-[#0a3d54] truncate">{item?.title || '…'}</div>
          </div>
          <button type="button" onClick={onClose} className="h-10 w-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-600 shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {loading && <p className="text-sm text-slate-500 py-10 text-center">{t('admin.loading_detail')}</p>}
          {err && !loading && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{err}</p>}

          {item && (
            <>
              <section>
                <h3 className="text-sm font-bold text-[#0a3d54] mb-2">{t('admin.photos')}</h3>
                {item.photos?.length ? (
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
                    {item.photos.map((src, i) => (
                      <img key={`${src}-${i}`} src={src} alt="" className="h-36 w-48 sm:h-40 sm:w-56 rounded-xl object-cover shrink-0 snap-start bg-slate-100" />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">{t('admin.no_photos')}</p>
                )}
              </section>

              {item.risk_flags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.risk_flags.map((f) => (
                    <span key={f} className="rounded-full bg-red-50 text-red-600 px-2.5 py-1 text-xs font-semibold">{f}</span>
                  ))}
                </div>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-400 font-semibold uppercase mb-1">{t('admin.basics')}</div>
                  <dl className="space-y-1.5 text-slate-700">
                    <div><span className="text-slate-400">Ref:</span> {item.reference_code}</div>
                    <div><span className="text-slate-400">{t('dash.field_type')}:</span> {item.property_type}</div>
                    <div><span className="text-slate-400">{t('dash.field_bedrooms')}:</span> {item.bedrooms} · {t('dash.field_bathrooms')}: {item.bathrooms}</div>
                    <div><span className="text-slate-400">{t('dash.field_size')}:</span> {item.size_sqm || '—'} m²</div>
                    <div><span className="text-slate-400">{t('dash.field_occupants')}:</span> {item.max_occupants || '—'}</div>
                    <div><span className="text-slate-400">{t('dash.field_gender')}:</span> {item.gender_preference}</div>
                    <div><span className="text-slate-400">Furnished:</span> {item.furnished ? '✓' : '—'}</div>
                    <div><span className="text-slate-400">{t('dash.field_available')}:</span> {item.available_from || '—'}</div>
                    <div><span className="text-slate-400">{t('dash.field_min_stay')}:</span> {item.minimum_stay_months || '—'}</div>
                  </dl>
                </div>
                <div>
                  <div className="text-xs text-slate-400 font-semibold uppercase mb-1">{t('admin.pricing')}</div>
                  <dl className="space-y-1.5 text-slate-700">
                    <div className="text-lg font-bold text-[#0a4d68]">{money(item.price, locale)} / ay</div>
                    {item.deposit && <div><span className="text-slate-400">{t('dash.field_deposit')}:</span> {money(item.deposit, locale)}</div>}
                    <div><span className="text-slate-400">Bills:</span> {item.bills_included ? 'Dahil' : 'Hariç'} {item.bills_note ? `· ${item.bills_note}` : ''}</div>
                    {item.agency_fee_note && <div><span className="text-slate-400">Komisyon:</span> {item.agency_fee_note}</div>}
                    {item.price_gbp != null && <div className="text-xs text-slate-400">≈ £{item.price_gbp} GBP</div>}
                  </dl>
                  <div className="text-xs text-slate-400 font-semibold uppercase mt-4 mb-1">{t('admin.location')}</div>
                  <dl className="space-y-1.5 text-slate-700">
                    <div>{item.city}{item.neighbourhood ? ` · ${item.neighbourhood}` : ''}</div>
                    {item.university && <div><span className="text-slate-400">Üni:</span> {item.university.name}</div>}
                    <div className="rounded-xl bg-amber-50 text-amber-900 px-3 py-2 text-xs leading-relaxed">
                      <div className="font-semibold mb-0.5">{t('admin.private_address')}</div>
                      {item.address_private || '—'}
                    </div>
                  </dl>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-bold text-[#0a3d54] mb-2">{t('admin.description')}</h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{item.description || '—'}</p>
                {item.amenities?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {item.amenities.map((a) => (
                      <span key={a} className="rounded-full bg-slate-100 text-slate-600 px-2.5 py-1 text-xs font-medium">{t(`amenity.${a}`) || a}</span>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                <h3 className="text-sm font-bold text-[#0a3d54] mb-2">{t('admin.owner_info')}</h3>
                <div className="space-y-1 text-slate-700">
                  <div className="font-semibold">{item.owner?.display_name || item.owner?.full_name || '—'}</div>
                  {item.owner?.is_agency && <div className="text-xs text-slate-500">{t('admin.agency')}{item.owner.agency_name ? `: ${item.owner.agency_name}` : ''}</div>}
                  <div className="text-xs">
                    {item.owner?.verification_status === 'verified'
                      ? <span className="text-[#15803d] font-semibold">{t('admin.verified')}</span>
                      : <span className="text-amber-700 font-semibold">{t('admin.pending_owner')}</span>}
                  </div>
                  {item.owner?.phone && <div><span className="text-slate-400">{t('admin.phone')}:</span> {item.owner.phone}</div>}
                  {item.owner?.email && <div><span className="text-slate-400">{t('admin.email')}:</span> {item.owner.email}</div>}
                </div>
              </section>

              <section className="rounded-2xl border border-[#0a4d68]/20 bg-white p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-[#0a3d54]">{t('admin.message_to_owner')}</h3>
                  <p className="text-xs text-slate-500 mt-1">{t('admin.message_hint')}</p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{t('admin.presets')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {presets.map(([k, label]) => (
                      <button key={k} type="button" onClick={() => appendPreset(label)} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-white">
                        {label.length > 42 ? `${label.slice(0, 40)}…` : label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder={t('admin.message_placeholder')}
                  className="w-full rounded-xl border border-slate-200 bg-[#faf9f7] px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#0a4d68]/25 resize-y min-h-[96px]"
                />
                <p className="text-[11px] text-slate-500">{t('admin.request_changes_hint')}</p>
              </section>

              <div className="flex flex-col sm:flex-row gap-2 sticky bottom-0 bg-[#f6f4f0] pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <button type="button" disabled={busy} onClick={() => run('approve')} className="h-11 flex-1 rounded-xl bg-[#15803d] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
                  <CheckCircle2 className="h-4 w-4" /> {t('admin.approve')}
                </button>
                <button type="button" disabled={busy} onClick={() => run('request_changes')} className="h-11 flex-1 rounded-xl bg-[#0a4d68] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
                  <Send className="h-4 w-4" /> {t('admin.request_changes')}
                </button>
                <button type="button" disabled={busy} onClick={() => run('reject')} className="h-11 flex-1 rounded-xl bg-red-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
                  <XCircle className="h-4 w-4" /> {t('admin.reject')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminView({ t, locale, auth }) {
  const [tab, setTab] = useState('queue');
  const [d, setD] = useState({});
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [toast, setToast] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [uniForm, setUniForm] = useState(null); // null | {} editing
  const [uniSaving, setUniSaving] = useState(false);
  const reload = (k) => {
    const map = {
      queue: 'admin/queue',
      reports: 'admin/reports',
      users: 'admin/users',
      invoices: 'admin/invoices',
      universities: 'admin/universities',
      coords: 'admin/universities',
      audit: 'admin/audit',
      health: 'admin/health',
    };
    api(map[k]).then((r) => {
      setD((s) => ({ ...s, [k]: r.items || [] }));
      if (k === 'invoices') setInvoiceSummary(r.summary || null);
    });
  };
  useEffect(() => {
    if (!auth?.signedIn || auth?.role !== 'admin') return;
    reload(tab);
  }, [tab, auth?.signedIn, auth?.role]);
  const act = async (p, body, k) => {
    const res = await api(p, { method: 'POST', body: JSON.stringify(body) });
    if (res?.error) throw new Error(res.error);
    setToast('İşlem kaydedildi (audit_log).');
    reload(k);
    if (k !== 'audit') reload('audit');
    setTimeout(() => setToast(''), 3000);
    return res;
  };

  if (!auth?.signedIn || auth?.role !== 'admin') {
    return (
      <div className="container py-16 text-center text-slate-500">
        Yönetim paneli yalnızca admin hesaplarına açıktır.
      </div>
    );
  }

  const tabs = [
    ['queue', t('admin.queue')],
    ['reports', t('admin.reports')],
    ['users', t('admin.users')],
    ['invoices', t('admin.payments')],
    ['universities', t('admin.universities')],
    ['health', t('admin.health')],
    ['audit', t('admin.audit')],
  ];

  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold text-[#0a3d54] mb-6 flex items-center gap-2"><ShieldAlert className="h-6 w-6" /> {t('admin.title')}</h1>
      {toast && <div className="mb-4 rounded-xl bg-[#dcfce7] text-[#15803d] px-4 py-3 text-sm font-medium">{toast}</div>}
      <div className="flex gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
        {tabs.map(([k, label]) => <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-[#0a4d68] text-[#0a4d68]' : 'border-transparent text-slate-500'}`}>{label}</button>)}
      </div>

      {tab === 'queue' && (
        <div className="space-y-3">
          {(d.queue || []).map(l => (
            <div key={l.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <button
                type="button"
                onClick={() => setSelectedId(l.id)}
                className="w-full flex items-start gap-3 sm:gap-4 text-start group cursor-pointer"
              >
                <img src={l.photo} alt="" className="h-20 w-28 rounded-lg object-cover shrink-0 bg-slate-100" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 group-hover:text-[#0a4d68] transition-colors">{l.title}</span>
                    {l.priority && <span className="rounded-full bg-red-50 text-red-600 px-2 py-0.5 text-xs font-semibold flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {t('admin.priority')}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{l.owner} · {l.reference_code}{l.city ? ` · ${l.city}` : ''}{l.price ? ` · ${money(l.price, locale)}` : ''}</div>
                  {l.risk_flags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {l.risk_flags.map(f => <span key={f} className="rounded-full bg-red-50 text-red-600 px-2 py-0.5 text-[11px] font-medium">{f}</span>)}
                    </div>
                  )}
                  <div className="mt-2 text-xs font-semibold text-[#0a4d68]">{t('admin.open_detail')} →</div>
                </div>
              </button>
              <div className="flex flex-col sm:flex-row gap-2 mt-3 sm:justify-end">
                <button type="button" onClick={() => setSelectedId(l.id)} className="inline-flex items-center justify-center gap-1 h-9 rounded-lg border border-slate-200 bg-white px-3 text-slate-700 text-sm font-semibold">
                  <Eye className="h-4 w-4" /> {t('admin.open_detail')}
                </button>
                <button type="button" onClick={() => act('admin/review', { id: l.id, action: 'approve' }, 'queue')} className="inline-flex items-center justify-center gap-1 h-9 rounded-lg bg-[#15803d] px-3 text-white text-sm font-semibold"><CheckCircle2 className="h-4 w-4" /> {t('admin.approve')}</button>
              </div>
            </div>
          ))}
          {(!d.queue || d.queue.length === 0) && <p className="text-slate-400 text-center py-10">{t('admin.no_items')}</p>}
        </div>
      )}

      {selectedId && (
        <AdminReviewDetail
          t={t}
          locale={locale}
          listingId={selectedId}
          onClose={() => setSelectedId(null)}
          onAct={async (action, reason) => {
            await act('admin/review', { id: selectedId, action, reason: reason || undefined }, 'queue');
          }}
        />
      )}

      {tab === 'reports' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 mb-1">{t('admin.reports_hint')}</p>
          {(d.reports || []).map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col lg:flex-row lg:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800">
                    {r.title || r.ref}
                    <span className="text-xs text-slate-400 font-normal"> · #{r.ref}</span>
                    {r.count > 1 && <span className="ms-2 text-xs text-amber-700 font-bold">×{r.count}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                    {r.owner && <span>{r.owner}</span>}
                    {r.city && <span>· {r.city}</span>}
                    {r.listing_status && <span>· {r.listing_status}</span>}
                    {r.created_at && (
                      <span>· {new Date(r.created_at).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB')}</span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-amber-900 mt-2">
                    {t(`report.reasons.${r.reason}`) !== `report.reasons.${r.reason}`
                      ? t(`report.reasons.${r.reason}`)
                      : r.reason}
                  </div>
                  {r.detail && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{r.detail}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className={`text-xs rounded-full px-2.5 py-1 font-semibold ${
                    r.status === 'open' ? 'bg-amber-50 text-amber-800' : 'bg-[#dcfce7] text-[#15803d]'
                  }`}>
                    {r.status === 'open' ? t('dash.report_open') : t('dash.report_resolved')}
                  </span>
                  {r.listing_id && (
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.listing_id)}
                      className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
                    >
                      {t('admin.open_detail')}
                    </button>
                  )}
                  {r.status === 'open' && (
                    <>
                      <button
                        type="button"
                        onClick={() => act('admin/reports/resolve', { id: r.id, listing_id: r.listing_id, action: 'dismiss' }, 'reports')}
                        className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold"
                      >
                        {t('admin.dismiss_report')}
                      </button>
                      <button
                        type="button"
                        onClick={() => act('admin/reports/resolve', { id: r.id, listing_id: r.listing_id, action: 'unpublish' }, 'reports')}
                        className="h-9 rounded-lg bg-[#0a4d68] px-3 text-white text-sm font-semibold"
                      >
                        {t('admin.unpublish')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!(d.reports || []).length && <p className="text-sm text-slate-400 py-8 text-center">{t('admin.no_items')}</p>}
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-2">
          {(d.users || []).map(u => (
            <div key={u.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{u.name || '—'}</div>
                  <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-2 gap-y-1">
                    <span>{u.role}</span>
                    {u.verification_status && (
                      <span className={
                        u.verification_status === 'verified' ? 'text-emerald-700 font-semibold'
                          : u.verification_status === 'pending' ? 'text-amber-700 font-semibold'
                            : u.verification_status === 'rejected' ? 'text-red-600 font-semibold'
                              : ''
                      }>
                        · {u.verification_status === 'verified' ? t('admin.verified')
                          : u.verification_status === 'pending' ? t('admin.verify_pending')
                            : u.verification_status === 'rejected' ? t('admin.verify_rejected')
                              : u.verification_status}
                      </span>
                    )}
                  </div>
                  {u.verification_note && (
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{u.verification_note}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${u.status === 'active' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-red-50 text-red-600'}`}>{u.status}</span>
                  {u.landlord_id && u.verification_status !== 'verified' && (
                    <button
                      type="button"
                      onClick={() => act('admin/landlords/verify', { landlord_id: u.landlord_id, user_id: u.id, status: 'verified' }, 'users')}
                      className="h-8 rounded-lg bg-[#15803d] px-3 text-white text-sm font-semibold inline-flex items-center gap-1"
                    >
                      <BadgeCheck className="h-3.5 w-3.5" /> {t('admin.verify_landlord')}
                    </button>
                  )}
                  {u.landlord_id && u.verification_status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => act('admin/landlords/verify', { landlord_id: u.landlord_id, user_id: u.id, status: 'rejected' }, 'users')}
                      className="h-8 rounded-lg border border-red-200 text-red-700 px-3 text-sm font-semibold"
                    >
                      {t('admin.reject_verify')}
                    </button>
                  )}
                  {u.landlord_id && u.verification_status === 'verified' && (
                    <button
                      type="button"
                      onClick={() => act('admin/landlords/verify', { landlord_id: u.landlord_id, user_id: u.id, status: 'unverified' }, 'users')}
                      className="h-8 rounded-lg border border-slate-200 px-3 text-sm"
                    >
                      {t('admin.revoke_verify')}
                    </button>
                  )}
                  {u.role !== 'admin' && (u.status === 'active'
                    ? <button onClick={() => act('admin/users/status', { id: u.id, status: 'suspended' }, 'users')} className="h-8 rounded-lg border border-slate-200 px-3 text-sm">{t('admin.suspend')}</button>
                    : <button onClick={() => act('admin/users/status', { id: u.id, status: 'active' }, 'users')} className="h-8 rounded-lg border border-slate-200 px-3 text-sm">{t('admin.restore')}</button>)}
                </div>
              </div>
            </div>
          ))}
          {!(d.users || []).length && <p className="text-sm text-slate-400 py-6 text-center">{t('admin.no_items')}</p>}
        </div>
      )}

      {tab === 'invoices' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{t('admin.payments_hint')}</p>
          {invoiceSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">{t('admin.shopier_paid')}</div>
                <div className="text-xl font-bold text-emerald-900 tabular-nums">{invoiceSummary.shopier_paid ?? 0}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">{t('admin.shopier_pending')}</div>
                <div className="text-xl font-bold text-amber-900 tabular-nums">{invoiceSummary.shopier_pending ?? 0}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{t('admin.bank_unpaid')}</div>
                <div className="text-xl font-bold text-slate-800 tabular-nums">{invoiceSummary.bank_unpaid ?? 0}</div>
              </div>
            </div>
          )}
          {(d.invoices || []).map((inv) => {
            const isShopier = inv.source === 'shopier';
            const statusCls = inv.status === 'paid'
              ? 'bg-[#dcfce7] text-[#15803d]'
              : inv.status === 'failed' || inv.status === 'cancelled'
                ? 'bg-red-50 text-red-700'
                : 'bg-amber-50 text-amber-700';
            const when = inv.paid_at || inv.created_at;
            const whenLabel = when
              ? new Date(when).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })
              : '';
            return (
              <div key={`${inv.source || 'inv'}-${inv.id}`} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-3.5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        isShopier ? 'bg-[#0a4d68] text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                      >
                        {isShopier ? 'Shopier' : t('admin.bank_transfer')}
                      </span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${statusCls}`}>
                        {inv.status === 'paid' ? t('admin.payment_paid')
                          : inv.status === 'pending' || inv.status === 'unpaid' ? t('admin.payment_pending')
                            : inv.status}
                      </span>
                      {whenLabel && <span className="text-[11px] text-slate-400">{whenLabel}</span>}
                    </div>
                    <div className="font-semibold text-slate-800 truncate">{inv.user}</div>
                    <div className="text-xs text-slate-500 break-words">
                      {inv.package}
                      {inv.listing_ref ? ` · ${t('dash.ref')}: ${inv.listing_ref}` : ''}
                      {inv.platform_order_id ? ` · ${inv.platform_order_id}` : ''}
                      {inv.bank_reference && !isShopier ? ` · ${inv.bank_reference}` : ''}
                    </div>
                    {inv.user_email && (
                      <div className="text-[11px] text-slate-400 truncate">{inv.user_email}{inv.buyer_phone ? ` · ${inv.buyer_phone}` : ''}</div>
                    )}
                    {isShopier && inv.shopier_payment_id && (
                      <div className="text-[11px] text-slate-400 font-mono">Shopier ID: {inv.shopier_payment_id}</div>
                    )}
                    {inv.listing_title && (
                      <div className="text-xs text-slate-600 truncate">{inv.listing_title}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-center justify-between sm:justify-end">
                    <div className="text-lg font-bold text-[#0a4d68] tabular-nums">
                      {money({ amount: inv.amount, currency: inv.currency }, locale)}
                    </div>
                    {!isShopier && (inv.status === 'unpaid' || inv.status === 'pending') && (
                      <button
                        type="button"
                        onClick={() => act('admin/invoices/pay', { id: inv.id }, 'invoices')}
                        className="inline-flex items-center gap-1 h-9 rounded-lg bg-[#15803d] px-3 text-white text-sm font-semibold"
                      >
                        <CreditCard className="h-4 w-4" /> {t('admin.mark_paid')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {!(d.invoices || []).length && (
            <p className="text-sm text-slate-400 py-8 text-center">{t('admin.no_payments')}</p>
          )}
        </div>
      )}

      {tab === 'universities' && (
        <div className="space-y-4">
          <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{t('admin.uni_hint')}</span>
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-slate-500">
              {(d.universities || []).length} {t('admin.uni_count')}
            </p>
            <button
              type="button"
              onClick={() => setUniForm({
                id: null,
                name_tr: '',
                name_en: '',
                slug: '',
                city: KKTC_CITIES[0] || 'Lefkoşa',
                lat: '',
                lng: '',
                students: '',
                coordinates_verified: false,
                is_active: true,
              })}
              className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-[#0a4d68] px-4 text-white text-sm font-semibold"
            >
              <Plus className="h-4 w-4" /> {t('admin.uni_add')}
            </button>
          </div>

          {uniForm && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-[#0a3d54]">
                  {uniForm.id ? t('admin.uni_edit') : t('admin.uni_add')}
                </h3>
                <button type="button" onClick={() => setUniForm(null)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50" aria-label={t('admin.close')}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-500">
                  {t('admin.uni_name_tr')}
                  <input
                    value={uniForm.name_tr}
                    onChange={(e) => setUniForm((s) => ({ ...s, name_tr: e.target.value }))}
                    className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#0a4d68]/25"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-500">
                  {t('admin.uni_name_en')}
                  <input
                    value={uniForm.name_en}
                    onChange={(e) => setUniForm((s) => ({ ...s, name_en: e.target.value }))}
                    className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#0a4d68]/25"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-500">
                  {t('admin.uni_slug')}
                  <input
                    value={uniForm.slug}
                    onChange={(e) => setUniForm((s) => ({ ...s, slug: e.target.value }))}
                    placeholder="otomatik"
                    className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#0a4d68]/25"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-500">
                  {t('admin.uni_city')}
                  <select
                    value={uniForm.city}
                    onChange={(e) => setUniForm((s) => ({ ...s, city: e.target.value }))}
                    className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#0a4d68]/25 bg-white"
                  >
                    {KKTC_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-500">
                  {t('admin.uni_lat')}
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={uniForm.lat}
                    onChange={(e) => setUniForm((s) => ({ ...s, lat: e.target.value }))}
                    placeholder="35.14"
                    className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#0a4d68]/25"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-500">
                  {t('admin.uni_lng')}
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={uniForm.lng}
                    onChange={(e) => setUniForm((s) => ({ ...s, lng: e.target.value }))}
                    placeholder="33.91"
                    className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#0a4d68]/25"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-500">
                  {t('admin.uni_students')}
                  <input
                    type="number"
                    inputMode="numeric"
                    value={uniForm.students}
                    onChange={(e) => setUniForm((s) => ({ ...s, students: e.target.value }))}
                    className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#0a4d68]/25"
                  />
                </label>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 min-h-11">
                  <input
                    type="checkbox"
                    checked={!!uniForm.coordinates_verified}
                    onChange={(e) => setUniForm((s) => ({ ...s, coordinates_verified: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {t('admin.uni_verified')}
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 min-h-11">
                  <input
                    type="checkbox"
                    checked={uniForm.is_active !== false}
                    onChange={(e) => setUniForm((s) => ({ ...s, is_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {t('admin.uni_active')}
                </label>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
                <button type="button" onClick={() => setUniForm(null)} className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600">
                  {t('admin.close')}
                </button>
                <button
                  type="button"
                  disabled={uniSaving}
                  onClick={async () => {
                    setUniSaving(true);
                    try {
                      await act('admin/universities', {
                        id: uniForm.id || undefined,
                        name_tr: uniForm.name_tr,
                        name_en: uniForm.name_en,
                        slug: uniForm.slug || undefined,
                        city: uniForm.city,
                        lat: uniForm.lat === '' ? undefined : uniForm.lat,
                        lng: uniForm.lng === '' ? undefined : uniForm.lng,
                        students: uniForm.students === '' ? undefined : uniForm.students,
                        coordinates_verified: !!uniForm.coordinates_verified,
                        is_active: uniForm.is_active !== false,
                      }, 'universities');
                      setUniForm(null);
                    } catch (e) {
                      setToast(e?.message || t('admin.uni_error'));
                      setTimeout(() => setToast(''), 3500);
                    } finally {
                      setUniSaving(false);
                    }
                  }}
                  className="h-11 rounded-xl bg-[#0a4d68] px-5 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {uniSaving ? t('common.loading') : t('admin.uni_save')}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {(d.universities || []).map((u) => (
              <div key={u.id} className={`rounded-xl border bg-white p-3 sm:p-4 ${u.is_active === false ? 'border-slate-100 opacity-70' : 'border-slate-200'}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">{u.short || u.name}</span>
                      {u.coordinates_verified
                        ? <span className="text-[11px] rounded-full px-2 py-0.5 font-semibold bg-[#dcfce7] text-[#15803d] inline-flex items-center gap-1"><BadgeCheck className="h-3 w-3" /> {t('admin.verified')}</span>
                        : <span className="text-[11px] rounded-full px-2 py-0.5 font-semibold bg-amber-50 text-amber-800">{t('admin.uni_unverified')}</span>}
                      {u.is_active === false && (
                        <span className="text-[11px] rounded-full px-2 py-0.5 font-semibold bg-slate-100 text-slate-500">{t('admin.uni_inactive')}</span>
                      )}
                    </div>
                    <div className="text-sm text-slate-700 mt-0.5 truncate">{u.name_tr || u.name}</div>
                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-2">
                      <span>{u.city}</span>
                      {u.lat != null && u.lng != null && (
                        <span>· {Number(u.lat).toFixed(4)}, {Number(u.lng).toFixed(4)}</span>
                      )}
                      {u.slug && <span className="font-mono">· {u.slug}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setUniForm({
                        id: u.id,
                        name_tr: u.name_tr || u.name || '',
                        name_en: u.name_en || '',
                        slug: u.slug || '',
                        city: u.city || KKTC_CITIES[0],
                        lat: u.lat ?? '',
                        lng: u.lng ?? '',
                        students: u.students ?? '',
                        coordinates_verified: !!u.coordinates_verified,
                        is_active: u.is_active !== false,
                      })}
                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 inline-flex items-center gap-1"
                    >
                      <Pencil className="h-3.5 w-3.5" /> {t('admin.uni_edit')}
                    </button>
                    {!u.coordinates_verified && (
                      <button
                        type="button"
                        onClick={() => act('admin/coords/verify', { id: u.id, lat: u.lat, lng: u.lng }, 'universities')}
                        className="h-10 rounded-lg bg-[#0a4d68] px-3 text-white text-sm font-semibold"
                      >
                        {t('admin.verify')}
                      </button>
                    )}
                    {u.is_active !== false ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(t('admin.uni_confirm_remove'))) return;
                          act('admin/universities/delete', { id: u.id }, 'universities');
                        }}
                        className="h-10 rounded-lg border border-red-200 text-red-700 px-3 text-sm font-semibold inline-flex items-center gap-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t('admin.uni_remove')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => act('admin/universities', {
                          id: u.id,
                          name_tr: u.name_tr || u.name,
                          name_en: u.name_en || u.name_tr || u.name,
                          slug: u.slug,
                          city: u.city,
                          lat: u.lat,
                          lng: u.lng,
                          students: u.students,
                          coordinates_verified: !!u.coordinates_verified,
                          is_active: true,
                        }, 'universities')}
                        className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold"
                      >
                        {t('admin.uni_restore')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!(d.universities || []).length && <p className="text-slate-400 text-center py-10">{t('admin.no_items')}</p>}
          </div>
        </div>
      )}

      {tab === 'health' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(d.health || []).map(h => (
            <div key={h.check_name} className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3">
              <Activity className={`h-5 w-5 ${h.status === 'ok' ? 'text-[#15803d]' : 'text-red-500'}`} />
              <div>
                <div className="font-semibold text-slate-800">{h.check_name} · <span className={h.status === 'ok' ? 'text-[#15803d]' : 'text-red-500'}>{h.status === 'ok' ? t('admin.ok') : t('admin.fail')}</span></div>
                <div className="text-xs text-slate-500">{h.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-2">
          {(d.audit || []).map(a => (
            <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#0a4d68]">{a.action}</span>
                <span className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</span>
              </div>
              <div className="text-xs text-slate-500">{a.actor_user} · {a.entity_type}:{a.entity_id}</div>
              <div className="text-xs text-slate-400 font-mono mt-1">{JSON.stringify(a.before_snapshot)} → {JSON.stringify(a.after_snapshot)}</div>
            </div>
          ))}
          {(!d.audit || d.audit.length === 0) && <p className="text-slate-400 text-center py-10">{t('admin.no_items')}</p>}
        </div>
      )}
    </div>
  );
}

// ======================= WHATSAPP SIMULATOR =======================
export function WhatsAppView({ t, locale }) {
  const [flow, setFlow] = useState('student');
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const send = async () => {
    if (!input.trim()) return;
    const text = input; setInput('');
    setMsgs(m => [...m, { me: true, text }]);
    const res = await api('whatsapp/sim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flow, message: text }) });
    setMsgs(m => [...m, { me: false, res }]);
  };
  return (
    <div className="container py-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-[#0a3d54] flex items-center gap-2"><Bot className="h-6 w-6" /> {t('wa.title')}</h1>
      <p className="text-slate-500 mt-1">{t('wa.subtitle')}</p>
      <div className="flex gap-2 mt-4 mb-3">
        {[['student', t('wa.student_flow')], ['landlord', t('wa.landlord_flow')]].map(([k, label]) => (
          <button key={k} onClick={() => { setFlow(k); setMsgs([]); }} className={`h-9 rounded-full px-4 text-sm font-semibold ${flow === k ? 'bg-[#0a4d68] text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-[#efe7dd] p-4 h-[420px] overflow-y-auto flex flex-col gap-3">
        {msgs.length === 0 && <p className="text-slate-500 text-sm text-center my-auto">{flow === 'student' ? 'Örn: "Girne\'de ucuz doğrulanmış daire arıyorum"' : 'Örn: "Girne\'de 2+1 daire, 620 GBP, eşyalı"'}</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[85%] ${m.me ? 'self-end' : 'self-start'}`}>
            {m.me ? (
              <div className="bg-[#dcf8c6] rounded-2xl rounded-tr-sm px-3 py-2 text-sm text-slate-800">{m.text}</div>
            ) : (
              <div className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-slate-800 shadow-sm">
                {m.res?.reply_type === 'cards' ? (
                  <div className="space-y-2">
                    {(m.res.cards || []).map(c => (
                      <div key={c.ref} className="flex gap-2 border border-slate-100 rounded-xl p-2">
                        <img src={c.photo} alt="" className="h-14 w-16 rounded-lg object-cover" />
                        <div className="min-w-0">
                          <div className="font-semibold text-xs truncate flex items-center gap-1">{c.verified && <BadgeCheck className="h-3 w-3 text-[#15803d]" />}{c.title}</div>
                          <div className="text-[11px] text-slate-500">{money(c.price, locale)} · {c.walking_minutes}dk · {c.city}</div>
                          <div className="text-[11px] text-[#0a4d68]">/{c.ref}</div>
                        </div>
                      </div>
                    ))}
                    <p className="text-[11px] text-slate-400">{m.res.note}</p>
                  </div>
                ) : m.res?.reply_type === 'summary' ? (
                  <div>
                    <div className="font-semibold text-xs mb-1">Çıkarılan bilgiler:</div>
                    <ul className="text-[12px] text-slate-600 space-y-0.5">
                      {Object.entries(m.res.extracted).map(([k, v]) => <li key={k}>· {k}: <b>{String(v)}</b></li>)}
                    </ul>
                    <p className="text-[11px] text-amber-700 mt-2">{m.res.note}</p>
                  </div>
                ) : <span>{JSON.stringify(m.res)}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={t('wa.type')} className="flex-1 h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/30" />
        <button onClick={send} className="h-11 w-11 rounded-xl bg-[#25D366] text-white flex items-center justify-center"><Send className="h-5 w-5" /></button>
      </div>
      <p className="text-xs text-slate-400 mt-3">{t('wa.note')}</p>
    </div>
  );
}
