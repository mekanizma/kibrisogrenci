'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, User, Mail, Phone, MapPin, GraduationCap, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { KKTC_CITIES } from '@/lib/universities';

const inp =
  'w-full h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/25 focus:border-[#0a4d68]/40';

export default function ProfileView({ t, locale, currency, setLocale, setCurrency, config, auth, setAuthModal }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    full_name: '',
    phone_e164: '',
    bio: '',
    city: '',
    university_id: '',
    preferred_language: locale || 'tr',
    preferred_currency: currency || 'GBP',
  });
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(false);
  const fileRef = useRef(null);

  const cities = [
    ...KKTC_CITIES,
    ...(config?.cities || []).filter((c) => c && !KKTC_CITIES.includes(c)),
  ];
  const unis = config?.universities || [];

  useEffect(() => {
    if (!auth?.signedIn) return;
    let cancelled = false;
    api('my/profile')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const p = d.profile || {};
        setProfile(p);
        setForm({
          full_name: p.full_name || '',
          phone_e164: p.phone_e164 || '',
          bio: p.bio || '',
          city: p.city || '',
          university_id: p.university_id || '',
          preferred_language: p.preferred_language || locale || 'tr',
          preferred_currency: p.preferred_currency || currency || 'GBP',
        });
        setAvatarUrl(p.avatar_url || null);
      })
      .catch(() => {
        if (!cancelled) setMsg(t('profile.load_error'));
      });
    return () => {
      cancelled = true;
    };
  }, [auth?.signedIn, locale, currency, t]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!auth?.signedIn) {
    return (
      <div className="container py-16 text-center">
        <p className="text-slate-600 mb-4">{t('profile.signin_required')}</p>
        <button
          type="button"
          onClick={() => setAuthModal('signin')}
          className="h-11 px-5 rounded-xl bg-[#0a4d68] text-white font-semibold"
        >
          {t('nav.signin')}
        </button>
      </div>
    );
  }

  const setField = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMsg(t('profile.err_avatar_type'));
      setMsgOk(false);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMsg(t('profile.err_avatar_size'));
      setMsgOk(false);
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setBusy(true);
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api('my/profile/avatar', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(t('profile.err_avatar_upload'));
        setMsgOk(false);
        return;
      }
      setAvatarUrl(d.avatar_url || null);
      setPreviewUrl(null);
      if (d.profile) setProfile(d.profile);
      setMsg(t('profile.avatar_saved'));
      setMsgOk(true);
    } catch {
      setMsg(t('profile.err_avatar_upload'));
      setMsgOk(false);
    } finally {
      setBusy(false);
    }
  };

  const clearAvatar = async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await api('my/profile', {
        method: 'POST',
        body: JSON.stringify({ clear_avatar: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(t('profile.err_save'));
        setMsgOk(false);
        return;
      }
      setAvatarUrl(null);
      setPreviewUrl(null);
      if (d.profile) setProfile(d.profile);
      setMsg(t('profile.avatar_removed'));
      setMsgOk(true);
    } catch {
      setMsg(t('profile.err_save'));
      setMsgOk(false);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!form.full_name.trim() || form.full_name.trim().length < 2) {
      setMsg(t('auth.err_name'));
      setMsgOk(false);
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await api('my/profile', {
        method: 'POST',
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          phone_e164: form.phone_e164.trim(),
          bio: form.bio.trim(),
          city: form.city,
          university_id: form.university_id || null,
          preferred_language: form.preferred_language,
          preferred_currency: form.preferred_currency,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(t('profile.err_save'));
        setMsgOk(false);
        return;
      }
      if (d.profile) {
        setProfile(d.profile);
        setAvatarUrl(d.profile.avatar_url || null);
      }
      if (form.preferred_language && form.preferred_language !== locale) {
        setLocale?.(form.preferred_language);
      }
      if (form.preferred_currency && form.preferred_currency !== currency) {
        setCurrency?.(form.preferred_currency);
      }
      setMsg(t('profile.saved'));
      setMsgOk(true);
    } catch {
      setMsg(t('profile.err_save'));
      setMsgOk(false);
    } finally {
      setBusy(false);
    }
  };

  const displaySrc = previewUrl || avatarUrl;
  const initials = (form.full_name || auth.email || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="container py-6 sm:py-8 pb-24 max-w-2xl">
      <div className="mb-6">
        <h1 className="ko-display text-2xl sm:text-3xl font-semibold text-[#0a3d54]">{t('profile.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('profile.subtitle')}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-6 shadow-sm">
        {/* Avatar */}
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
          <div className="relative">
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full overflow-hidden bg-[#e8f2f6] border-2 border-white shadow ring-1 ring-slate-200 flex items-center justify-center">
              {displaySrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={displaySrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-[#0a4d68]">{initials || <User className="h-8 w-8" />}</span>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 end-0 h-9 w-9 rounded-full bg-[#0a4d68] text-white flex items-center justify-center shadow-md disabled:opacity-60"
              aria-label={t('profile.change_photo')}
            >
              <Camera className="h-4 w-4" />
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickAvatar} />
          </div>
          <div className="text-center sm:text-start flex-1 min-w-0">
            <div className="font-semibold text-[#0a3d54] truncate">{form.full_name || t('profile.your_name')}</div>
            <div className="text-sm text-slate-500 truncate" dir="ltr">{profile?.email || auth.email}</div>
            <div className="mt-2 flex flex-wrap justify-center sm:justify-start gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-[#0a4d68] hover:bg-slate-50 disabled:opacity-60"
              >
                {t('profile.change_photo')}
              </button>
              {(avatarUrl || previewUrl) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={clearAvatar}
                  className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t('profile.remove_photo')}
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">{t('profile.photo_hint')}</p>
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Fields */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> {t('auth.full_name')}
            </label>
            <input className={`${inp} mt-1.5`} value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} placeholder={t('auth.ph_name')} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> {t('auth.email')}
            </label>
            <input className={`${inp} mt-1.5 bg-slate-50 text-slate-500`} value={profile?.email || auth.email || ''} disabled dir="ltr" />
            <p className="text-[11px] text-slate-400 mt-1">{t('profile.email_locked')}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> {t('auth.phone')}
            </label>
            <input
              className={`${inp} mt-1.5`}
              value={form.phone_e164}
              onChange={(e) => setField('phone_e164', e.target.value)}
              placeholder="+90…"
              dir="ltr"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">{t('profile.bio')}</label>
            <textarea
              className="w-full mt-1.5 min-h-[88px] rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/25 resize-y"
              value={form.bio}
              maxLength={500}
              onChange={(e) => setField('bio', e.target.value)}
              placeholder={t('profile.bio_ph')}
            />
            <div className="text-[11px] text-slate-400 text-end mt-0.5">{form.bio.length}/500</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {t('auth.city')}
              </label>
              <select className={`${inp} mt-1.5`} value={form.city} onChange={(e) => setField('city', e.target.value)}>
                <option value="">{t('profile.any_city')}</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" /> {t('profile.university')}
              </label>
              <select className={`${inp} mt-1.5`} value={form.university_id} onChange={(e) => setField('university_id', e.target.value)}>
                <option value="">{t('search.any_university')}</option>
                {unis.map((u) => (
                  <option key={u.id} value={u.id}>{u.short || u.name_tr || u.name_en}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">{t('profile.language')}</label>
              <select className={`${inp} mt-1.5`} value={form.preferred_language} onChange={(e) => setField('preferred_language', e.target.value)}>
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
                <option value="ru">Русский</option>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">{t('profile.currency')}</label>
              <select className={`${inp} mt-1.5`} value={form.preferred_currency} onChange={(e) => setField('preferred_currency', e.target.value)}>
                {(config?.currencies || ['TRY', 'GBP', 'USD', 'EUR']).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {msg && (
          <p className={`text-xs rounded-xl px-3 py-2.5 ${msgOk ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-red-50 text-red-700'}`}>
            {msg}
          </p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="w-full h-12 rounded-xl bg-[#0a4d68] text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm shadow-[#0a4d68]/20"
        >
          <Save className="h-4 w-4" />
          {busy ? t('common.loading') : t('profile.save')}
        </button>
      </div>
    </div>
  );
}
