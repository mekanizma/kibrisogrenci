'use client';
import { useEffect, useState } from 'react';
import {
  Plus, Eye, Phone, Bookmark, MessageSquare, CreditCard, CheckCircle2, XCircle,
  ShieldAlert, Users2, FileText, MapPin, Activity, Clock, Building2, Send, Bot,
  BadgeCheck, AlertTriangle, Banknote,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const SYMBOL = { TRY: '₺', GBP: '£', USD: '$', EUR: '€' };
const money = (p, locale) => `${SYMBOL[p.currency] || ''}${Number(p.amount).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB')}`;
const api = (p, o) => fetch(`/api/${p}`, o).then(r => r.json());

const STATUS_STYLE = {
  published: 'bg-[#dcfce7] text-[#15803d]', pending_review: 'bg-amber-50 text-amber-700',
  draft: 'bg-slate-100 text-slate-500', rejected: 'bg-red-50 text-red-600',
};
function StatusPill({ s, t }) {
  const label = { published: t('dash.published'), pending_review: t('dash.pending'), draft: t('dash.draft'), rejected: t('dash.rejected') }[s] || s;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s] || 'bg-slate-100 text-slate-600'}`}>{label}</span>;
}

// ======================= LANDLORD DASHBOARD =======================
export function DashboardView({ t, locale, config }) {
  const owner = 'Ayşe Yılmaz';
  const [tab, setTab] = useState('listings');
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [inquiries, setInquiries] = useState([]);
  const [billing, setBilling] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', price_amount: '', price_currency: 'GBP', city: 'Girne', property_type: 'apartment' });
  const [toast, setToast] = useState('');

  const load = () => api(`my/listings?owner=${encodeURIComponent(owner)}`).then(setData);
  useEffect(() => { load(); api('my/analytics').then(setAnalytics); api('my/inquiries').then(d => setInquiries(d.items || [])); api(`my/billing?owner=${encodeURIComponent(owner)}`).then(setBilling); }, []);

  const submit = async (draft) => {
    const res = await api('my/listings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, owner, draft }) });
    if (res.error === 'quota_exceeded') { setToast('Kota doldu.'); return; }
    setToast(t('dash.submitted')); setCreating(false); setForm({ title: '', price_amount: '', price_currency: 'GBP', city: 'Girne', property_type: 'apartment' }); load();
    setTimeout(() => setToast(''), 4000);
  };

  const tabs = [['listings', t('dash.my_listings')], ['analytics', t('dash.analytics')], ['inquiries', t('dash.inquiries')], ['billing', t('dash.billing')]];
  const selCls = 'w-full h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/30';

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#0a3d54]">{t('dash.title')}</h1>
        {data?.quota && (
          <div className="text-sm text-slate-500">{t('dash.quota')}: <span className="font-bold text-[#0a4d68]">{data.quota.used}/{data.quota.total}</span> ({data.quota.package})</div>
        )}
      </div>
      {toast && <div className="mb-4 rounded-xl bg-[#dcfce7] text-[#15803d] px-4 py-3 text-sm font-medium">{toast}</div>}

      <div className="flex gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-[#0a4d68] text-[#0a4d68]' : 'border-transparent text-slate-500'}`}>{label}</button>
        ))}
      </div>

      {tab === 'listings' && (
        <div>
          <button onClick={() => setCreating(true)} className="mb-4 inline-flex items-center gap-2 h-11 rounded-xl bg-[#0a4d68] px-4 text-white font-semibold"><Plus className="h-5 w-5" /> {t('dash.new_listing')}</button>
          {creating && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-5">
              <h3 className="font-bold text-[#0a3d54] mb-3">{t('dash.create_title')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className={selCls} placeholder="Başlık" value={form.title} onChange={e => setForm(s => ({ ...s, title: e.target.value }))} />
                <select className={selCls} value={form.property_type} onChange={e => setForm(s => ({ ...s, property_type: e.target.value }))}>
                  {['apartment', 'studio', 'room', 'house'].map(p => <option key={p} value={p}>{t(`ptype.${p}`)}</option>)}
                </select>
                <input className={selCls} type="number" placeholder="Fiyat" value={form.price_amount} onChange={e => setForm(s => ({ ...s, price_amount: e.target.value }))} />
                <select className={selCls} value={form.price_currency} onChange={e => setForm(s => ({ ...s, price_currency: e.target.value }))}>
                  {['GBP', 'TRY', 'USD', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => submit(false)} className="h-11 rounded-xl bg-[#0a4d68] px-4 text-white font-semibold">{t('dash.submit_review')}</button>
                <button onClick={() => submit(true)} className="h-11 rounded-xl border border-slate-200 px-4 text-slate-600 font-semibold">{t('dash.save_draft')}</button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {(data?.items || []).map(l => (
              <div key={l.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-3">
                <img src={l.photo} alt="" className="h-16 w-24 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{l.title}</div>
                  <div className="text-xs text-slate-500">{t('dash.ref')}: {l.reference_code} · {l.city} · {money(l.price, locale)}</div>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Eye className="h-4 w-4" /> {l.view_count ?? 0}</span>
                  <span className="flex items-center gap-1"><Phone className="h-4 w-4" /> {l.contact_reveal_count ?? 0}</span>
                </div>
                <StatusPill s={l.status} t={t} />
              </div>
            ))}
            {(!data?.items || data.items.length === 0) && <p className="text-slate-400 text-center py-10">{t('dash.empty')}</p>}
          </div>
        </div>
      )}

      {tab === 'analytics' && analytics && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-[#0a3d54] mb-4">{t('dash.analytics')} · {t('dash.views')} / {t('dash.reveals')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.trend}>
                <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="views" fill="#0a4d68" radius={[4, 4, 0, 0]} />
                <Bar dataKey="reveals" fill="#e0a256" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'inquiries' && (
        <div className="space-y-3">
          {inquiries.map(i => (
            <div key={i.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-800">{i.from} <span className="text-xs text-slate-400">· {i.ref}</span></div>
                <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${i.source === 'whatsapp' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-slate-100 text-slate-500'}`}>{i.source}</span>
              </div>
              <p className="text-sm text-slate-600 mt-1">{i.message}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'billing' && billing && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold text-[#0a3d54] mb-3">{t('dash.billing')}</h3>
            <div className="rounded-xl bg-[#e8f2f6] p-4 mb-3">
              <div className="text-sm text-slate-500">{billing.subscription.package} · {billing.subscription.status}</div>
              <div className="text-lg font-bold text-[#0a4d68]">{billing.subscription.listings_used}/{billing.subscription.listings_total} {t('dash.used')}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="font-semibold text-slate-700 flex items-center gap-2 mb-2"><Banknote className="h-4 w-4" /> {t('dash.bank_transfer')}</div>
              <div className="text-sm text-slate-600 space-y-1">
                <div>{billing.bank_instructions.bank}</div>
                <div dir="ltr" className="font-mono text-xs">{billing.bank_instructions.iban}</div>
                <div>Ref: <span className="font-bold text-[#0a4d68]">{billing.bank_instructions.reference}</span></div>
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">{t('dash.bank_note')}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold text-[#0a3d54] mb-3">{t('admin.invoices')}</h3>
            <div className="space-y-2">
              {billing.invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm">
                  <span>{inv.package} · {money({ amount: inv.amount, currency: inv.currency }, locale)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${inv.status === 'paid' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-amber-50 text-amber-700'}`}>{inv.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================= ADMIN =======================
export function AdminView({ t, locale }) {
  const [tab, setTab] = useState('queue');
  const [d, setD] = useState({});
  const [toast, setToast] = useState('');
  const reload = (k) => {
    const map = { queue: 'admin/queue', reports: 'admin/reports', users: 'admin/users', invoices: 'admin/invoices', coords: 'admin/coords', audit: 'admin/audit', health: 'admin/health' };
    api(map[k]).then(r => setD(s => ({ ...s, [k]: r.items || [] })));
  };
  useEffect(() => { reload(tab); }, [tab]);
  const act = async (p, body, k) => { await api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); setToast('İşlem kaydedildi (audit_log).'); reload(k); if (k !== 'audit') reload('audit'); setTimeout(() => setToast(''), 3000); };

  const tabs = [['queue', t('admin.queue')], ['reports', t('admin.reports')], ['users', t('admin.users')], ['invoices', t('admin.invoices')], ['coords', t('admin.coords')], ['health', t('admin.health')], ['audit', t('admin.audit')]];

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
              <div className="flex items-start gap-4">
                <img src={l.photo} alt="" className="h-20 w-28 rounded-lg object-cover shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800">{l.title}</span>
                    {l.priority && <span className="rounded-full bg-red-50 text-red-600 px-2 py-0.5 text-xs font-semibold flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {t('admin.priority')}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{l.owner} · {l.reference_code}</div>
                  {l.risk_flags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {l.risk_flags.map(f => <span key={f} className="rounded-full bg-red-50 text-red-600 px-2 py-0.5 text-[11px] font-medium">{f}</span>)}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => act('admin/review', { id: l.id, action: 'approve' }, 'queue')} className="inline-flex items-center gap-1 h-9 rounded-lg bg-[#15803d] px-3 text-white text-sm font-semibold"><CheckCircle2 className="h-4 w-4" /> {t('admin.approve')}</button>
                  <button onClick={() => act('admin/review', { id: l.id, action: 'reject', reason: 'Uygun değil' }, 'queue')} className="inline-flex items-center gap-1 h-9 rounded-lg bg-red-500 px-3 text-white text-sm font-semibold"><XCircle className="h-4 w-4" /> {t('admin.reject')}</button>
                </div>
              </div>
            </div>
          ))}
          {(!d.queue || d.queue.length === 0) && <p className="text-slate-400 text-center py-10">{t('admin.no_items')}</p>}
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-3">
          {(d.reports || []).map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
              <div>
                <div className="font-semibold text-slate-800">{r.ref} · {r.reason} <span className="text-xs text-slate-400">×{r.count}</span></div>
                <div className="text-sm text-slate-500">{r.detail}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${r.status === 'open' ? 'bg-amber-50 text-amber-700' : 'bg-[#dcfce7] text-[#15803d]'}`}>{r.status}</span>
                {r.status === 'open' && <button onClick={() => act('admin/reports/resolve', { id: r.id, action: 'unpublish' }, 'reports')} className="h-9 rounded-lg bg-[#0a4d68] px-3 text-white text-sm font-semibold">{t('admin.unpublish')}</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-2">
          {(d.users || []).map(u => (
            <div key={u.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div><span className="font-semibold text-slate-800">{u.name}</span> <span className="text-xs text-slate-400">· {u.role} · {u.email}</span></div>
              <div className="flex items-center gap-2">
                <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${u.status === 'active' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-red-50 text-red-600'}`}>{u.status}</span>
                {u.role !== 'admin' && (u.status === 'active'
                  ? <button onClick={() => act('admin/users/status', { id: u.id, status: 'suspended' }, 'users')} className="h-8 rounded-lg border border-slate-200 px-3 text-sm">{t('admin.suspend')}</button>
                  : <button onClick={() => act('admin/users/status', { id: u.id, status: 'active' }, 'users')} className="h-8 rounded-lg border border-slate-200 px-3 text-sm">{t('admin.restore')}</button>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'invoices' && (
        <div className="space-y-2">
          {(d.invoices || []).map(inv => (
            <div key={inv.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div><span className="font-semibold text-slate-800">{inv.user}</span> <span className="text-xs text-slate-400">· {inv.package} · {money({ amount: inv.amount, currency: inv.currency }, locale)} · {inv.bank_reference}</span></div>
              <div className="flex items-center gap-2">
                <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${inv.status === 'paid' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-amber-50 text-amber-700'}`}>{inv.status}</span>
                {inv.status === 'unpaid' && <button onClick={() => act('admin/invoices/pay', { id: inv.id }, 'invoices')} className="inline-flex items-center gap-1 h-9 rounded-lg bg-[#15803d] px-3 text-white text-sm font-semibold"><CreditCard className="h-4 w-4" /> {t('admin.mark_paid')}</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'coords' && (
        <div>
          <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3 mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {t('admin.coord_warning')}</p>
          <div className="space-y-2">
            {(d.coords || []).map(u => (
              <div key={u.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                <div><span className="font-semibold text-slate-800">{u.short}</span> <span className="text-xs text-slate-400">· {u.name} · {u.city} · {u.lat.toFixed(3)}, {u.lng.toFixed(3)}</span></div>
                {u.coordinates_verified
                  ? <span className="text-xs rounded-full px-2 py-0.5 font-semibold bg-[#dcfce7] text-[#15803d] flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5" /> verified</span>
                  : <button onClick={() => act('admin/coords/verify', { id: u.id }, 'coords')} className="h-9 rounded-lg bg-[#0a4d68] px-3 text-white text-sm font-semibold">{t('admin.verify')}</button>}
              </div>
            ))}
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
