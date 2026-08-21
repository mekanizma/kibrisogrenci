'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import { api, getAccessToken } from '@/lib/api-client';

async function msgApi(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await api(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function fmtTime(iso, locale) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function MessagesView({ t, locale, auth, setAuthModal, initialId, setView }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(initialId || null);
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const loadInbox = useCallback(async () => {
    if (!auth?.signedIn) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { ok, data } = await msgApi('messages');
    if (ok) setItems(data.items || []);
    setLoading(false);
  }, [auth?.signedIn]);

  const loadThread = useCallback(async (id, soft) => {
    if (!id || !auth?.signedIn) return;
    if (!soft) setThreadLoading(true);
    const { ok, data, status } = await msgApi(`messages/${id}`);
    if (!ok) {
      if (status === 404) setErr(t('messages.not_found'));
      else setErr(t('messages.error'));
      setThread(null);
      setThreadLoading(false);
      return;
    }
    setErr('');
    setThread(data);
    setThreadLoading(false);
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)));
  }, [auth?.signedIn, t]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (initialId) setActiveId(initialId);
  }, [initialId]);

  useEffect(() => {
    if (!activeId) {
      setThread(null);
      return undefined;
    }
    loadThread(activeId, false);
    pollRef.current = setInterval(() => loadThread(activeId, true), 8000);
    return () => clearInterval(pollRef.current);
  }, [activeId, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages?.length, activeId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    setErr('');
    const { ok, data } = await msgApi(`messages/${activeId}`, {
      method: 'POST',
      body: JSON.stringify({ body: text }),
    });
    setSending(false);
    if (!ok) {
      setErr(t('messages.error'));
      return;
    }
    setDraft('');
    setThread((prev) => prev ? {
      ...prev,
      messages: [...(prev.messages || []), data.message],
    } : prev);
    setItems((prev) => {
      const next = prev.map((c) => (
        c.id === activeId
          ? { ...c, last_message_preview: text, last_message_at: data.message?.created_at, unread: false }
          : c
      ));
      return next.sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
    });
  };

  if (!auth?.signedIn) {
    return (
      <div className="container py-10 sm:py-14 max-w-lg">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <MessageCircle className="mx-auto h-10 w-10 text-[#0a4d68]/40" />
          <h1 className="mt-3 text-xl font-bold text-[#0a3d54]">{t('messages.title')}</h1>
          <p className="mt-2 text-sm text-slate-600">{t('messages.signin_required')}</p>
          <button
            type="button"
            onClick={() => setAuthModal('signin')}
            className="mt-5 h-11 rounded-xl bg-[#0a4d68] px-5 text-white font-semibold"
          >
            {t('nav.signin')}
          </button>
        </div>
      </div>
    );
  }

  const showThread = Boolean(activeId);
  const conv = thread?.conversation;

  return (
    <div className="container py-4 sm:py-6 max-w-5xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-[#0a3d54] flex items-center gap-2">
          <MessageCircle className="h-6 w-6 shrink-0" />
          {t('messages.title')}
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,320px)_1fr] gap-0 md:gap-4 rounded-2xl border border-slate-200 bg-white overflow-hidden min-h-[min(70vh,640px)]">
        {/* Inbox */}
        <aside className={`${showThread ? 'hidden md:flex' : 'flex'} flex-col border-b md:border-b-0 md:border-e border-slate-100 min-h-[50vh] md:min-h-0`}>
          <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('messages.inbox')}
          </div>
          {loading ? (
            <div className="p-6 text-sm text-slate-400">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-sm text-slate-500 leading-relaxed">{t('messages.empty')}</div>
          ) : (
            <ul className="flex-1 overflow-y-auto">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={`w-full text-start px-4 py-3.5 border-b border-slate-50 transition-colors ${
                      activeId === c.id ? 'bg-[#e8f4f7]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-sm truncate ${c.unread ? 'font-bold text-[#0a3d54]' : 'font-semibold text-slate-800'}`}>
                        {c.other_name || '—'}
                      </span>
                      {c.unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#0a4d68]" aria-hidden />}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {c.reference_code ? `#${c.reference_code}` : ''}{c.listing_title ? ` · ${c.listing_title}` : ''}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.last_message_preview || '—'}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Thread */}
        <section className={`${showThread ? 'flex' : 'hidden md:flex'} flex-col min-h-[min(70vh,640px)] md:min-h-0`}>
          {!activeId ? (
            <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-400 text-center">
              {t('messages.pick')}
            </div>
          ) : threadLoading && !thread ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">{t('common.loading')}</div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-slate-100 bg-[#f8fafc]">
                <button
                  type="button"
                  className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-xl text-slate-600 hover:bg-white"
                  onClick={() => setActiveId(null)}
                  aria-label={t('listing.back')}
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[#0a3d54] truncate">{conv?.other_name || '—'}</div>
                  <button
                    type="button"
                    className="text-xs text-[#0a4d68] truncate block text-start"
                    onClick={() => conv?.reference_code && setView({ name: 'listing', ref: conv.reference_code })}
                  >
                    {conv?.reference_code ? `#${conv.reference_code}` : ''}
                    {conv?.listing_title ? ` · ${conv.listing_title}` : ''}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-2.5 bg-[linear-gradient(180deg,#fafbfc,#f6f4f0)]">
                {(thread?.messages || []).map((m) => (
                  <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words ${
                        m.mine
                          ? 'bg-[#0a4d68] text-white rounded-br-md'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <div className={`mt-1 text-[10px] ${m.mine ? 'text-white/70' : 'text-slate-400'}`}>
                        {fmtTime(m.created_at, locale)}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {err && <p className="px-4 text-xs text-red-600">{err}</p>}

              <div className="border-t border-slate-100 p-3 sm:p-4 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="flex gap-2 items-end">
                  <textarea
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder={t('messages.placeholder')}
                    className="flex-1 min-h-[44px] max-h-28 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0a4d68]/25"
                  />
                  <button
                    type="button"
                    disabled={sending || !draft.trim()}
                    onClick={send}
                    className="h-11 w-11 shrink-0 rounded-xl bg-[#0a4d68] text-white inline-flex items-center justify-center disabled:opacity-50"
                    aria-label={t('messages.send')}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
