/** Live FX via Frankfurter (https://frankfurter.dev) — no API key. */

export const FX_QUOTES = ['TRY', 'USD', 'EUR'];
export const FX_FALLBACK_TO_GBP = {
  GBP: 1,
  TRY: 1 / 42.7,
  USD: 1 / 1.27,
  EUR: 1 / 1.17,
};

const FRANKFURTER_API = 'https://api.frankfurter.dev';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let memoryCache = { at: 0, fxToGbp: null, rows: null, date: null };

/**
 * Fetch GBP→quote rates from Frankfurter v2.
 * Response rows: { date, base, quote, rate } where rate = units of quote per 1 GBP.
 */
export async function fetchFrankfurterRows() {
  const quotes = FX_QUOTES.join(',');
  const url = `${FRANKFURTER_API}/v2/rates?base=GBP&quotes=${encodeURIComponent(quotes)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    // Next.js Data Cache (ignored outside Next fetch)
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`frankfurter_http_${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error('frankfurter_empty');
  return data.map((row) => ({
    base_currency: 'GBP',
    quote_currency: String(row.quote || '').toUpperCase(),
    rate: Number(row.rate),
    rate_date: row.date || new Date().toISOString().slice(0, 10),
    fetched_at: new Date().toISOString(),
  })).filter((r) => r.quote_currency && Number.isFinite(r.rate) && r.rate > 0);
}

/** Convert Frankfurter/DB rows (1 GBP = rate quote) → fx_to_gbp map (1 quote = ? GBP). */
export function rowsToFxToGbp(rows) {
  const fx = { GBP: 1 };
  for (const r of rows || []) {
    const quote = r.quote_currency || r.quote;
    const rate = Number(r.rate);
    if (!quote || !Number.isFinite(rate) || rate <= 0) continue;
    fx[String(quote).toUpperCase()] = 1 / rate;
  }
  return fx;
}

/** Build fx_to_gbp from DB-style rows (same shape as fetchFrankfurterRows). */
export function fxToGbpFromDbRows(rows) {
  const fx = { ...FX_FALLBACK_TO_GBP };
  for (const r of rows || []) {
    if (r.base_currency !== 'GBP' || !r.quote_currency || !r.rate) continue;
    const rate = Number(r.rate);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    fx[r.quote_currency] = 1 / rate;
  }
  return fx;
}

/**
 * Cached live rates. Returns { fxToGbp, rows, date, source } or null on failure.
 */
export async function getLiveFxToGbp() {
  const now = Date.now();
  if (memoryCache.fxToGbp && now - memoryCache.at < CACHE_TTL_MS) {
    return {
      fxToGbp: memoryCache.fxToGbp,
      rows: memoryCache.rows,
      date: memoryCache.date,
      source: 'cache',
    };
  }
  try {
    const rows = await fetchFrankfurterRows();
    const fxToGbp = rowsToFxToGbp(rows);
    if (!fxToGbp.TRY || !fxToGbp.USD || !fxToGbp.EUR) throw new Error('frankfurter_incomplete');
    memoryCache = {
      at: now,
      fxToGbp,
      rows,
      date: rows[0]?.rate_date || null,
    };
    return { fxToGbp, rows, date: memoryCache.date, source: 'frankfurter' };
  } catch {
    return null;
  }
}

/** Persist Frankfurter rows into fx_rates (best-effort). */
export async function persistFxRows(admin, rows) {
  if (!admin || !rows?.length) return 0;
  const { error } = await admin.from('fx_rates').upsert(rows, {
    onConflict: 'base_currency,quote_currency,rate_date',
  });
  if (error) throw error;
  return rows.length;
}
