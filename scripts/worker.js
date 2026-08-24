// Scheduled jobs (worker service). Idempotent; logs start/finish/row counts.
// Requires SUPABASE_SECRET_KEY + NEXT_PUBLIC_SUPABASE_URL in production.
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const log = (o) => console.log(JSON.stringify({ ts: new Date().toISOString(), svc: 'worker', ...o }));

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('missing supabase admin env');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function recordHealth(check_name, status, detail) {
  try {
    await admin().from('system_health').insert({ check_name, status, detail });
  } catch (e) {
    log({ job: 'health_write', status: 'error', err: String(e.message || e) });
  }
}

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function smtpCanary() {
  log({ job: 'smtp_canary', status: 'start' });
  if (!smtpConfigured()) {
    await recordHealth('smtp_canary', 'warn', 'SMTP not configured (SMTP_HOST/USER/PASS)');
    log({ job: 'smtp_canary', status: 'done', detail: 'not_configured' });
    return;
  }
  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      requireTLS: !secure && port === 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { minVersion: 'TLSv1.2' },
    });
    await t.verify();
    await recordHealth('smtp_canary', 'ok', `${process.env.SMTP_HOST}:${port}`);
    log({ job: 'smtp_canary', status: 'done', detail: 'verified' });
  } catch (e) {
    await recordHealth('smtp_canary', 'fail', String(e.message || e));
    log({ job: 'smtp_canary', status: 'error', err: String(e.message || e) });
  }
}

async function fxRefresh() {
  log({ job: 'fx_refresh', status: 'start' });
  try {
    // Frankfurter v2: https://frankfurter.dev — flat JSON, no API key
    const res = await fetch(
      'https://api.frankfurter.dev/v2/rates?base=GBP&quotes=TRY,USD,EUR',
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`fx http ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body) || !body.length) throw new Error('fx empty response');
    const fetchedAt = new Date().toISOString();
    const rows = body
      .map((row) => ({
        base_currency: 'GBP',
        quote_currency: String(row.quote || '').toUpperCase(),
        rate: Number(row.rate),
        rate_date: row.date || fetchedAt.slice(0, 10),
        fetched_at: fetchedAt,
      }))
      .filter((r) => r.quote_currency && Number.isFinite(r.rate) && r.rate > 0);
    if (rows.length) {
      await admin().from('fx_rates').upsert(rows, { onConflict: 'base_currency,quote_currency,rate_date' });
    }
    await recordHealth('fx_rates', 'ok', `frankfurter updated ${rows.length} rates`);
    log({ job: 'fx_refresh', status: 'done', rows: rows.length, date: rows[0]?.rate_date });
  } catch (e) {
    await recordHealth('fx_rates', 'fail', String(e.message || e));
    log({ job: 'fx_refresh', status: 'error', err: String(e.message || e) });
  }
}

async function expireListings() {
  log({ job: 'expire_listings', status: 'start' });
  try {
    const cutoff = new Date(Date.now() - 21 * 86400000).toISOString();
    const { data, error } = await admin()
      .from('listings')
      .update({ status: 'expired' })
      .eq('status', 'published')
      .lt('last_confirmed_available_at', cutoff)
      .select('id');
    if (error) throw error;
    log({ job: 'expire_listings', status: 'done', rows: (data || []).length });
  } catch (e) {
    log({ job: 'expire_listings', status: 'error', err: String(e.message || e) });
  }
}

async function recalcPriceIndex() {
  log({ job: 'recalc_price_index', status: 'start' });
  // Full spatial median recalc is SQL-heavy; placeholder keeps job wired.
  await recordHealth('price_index', 'ok', 'recalc stub — run SQL job when sample>=5');
  log({ job: 'recalc_price_index', status: 'done', rows: 0 });
}

const MIN = 60 * 1000;
setInterval(() => smtpCanary().catch((e) => log({ job: 'smtp_canary', status: 'error', err: String(e) })), 15 * MIN);
setInterval(() => {
  fxRefresh();
  expireListings();
  recalcPriceIndex();
}, 24 * 60 * MIN);

log({ status: 'started' });
smtpCanary();
fxRefresh();
expireListings();
recalcPriceIndex();
