import crypto from 'crypto';

/** Shopier PAT REST API (Bearer token → api.shopier.com/v1) */
export const SHOPIER_API_BASE = 'https://api.shopier.com/v1';

export function isShopierConfigured() {
  return !!(process.env.SHOPIER_PAT && process.env.SHOPIER_SHOP_SLUG);
}

export function isShopierWebhookConfigured() {
  return !!process.env.SHOPIER_WEBHOOK_TOKEN;
}

export function getShopierConfig() {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kibrisogrenci.com').replace(/\/$/, '');
  const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  // Prefer Supabase public object URL — Shopier rehosts media by fetching the URL.
  // Cloudflare-protected site assets (kibrisogrenci.com/*) often fail that fetch,
  // leaving a broken thumbnail on the Shopier checkout page.
  const defaultImage = supabase
    ? `${supabase}/storage/v1/object/public/public-assets/shopier/product.jpg`
    : `${site}/shopier-product.jpg`;

  return {
    pat: process.env.SHOPIER_PAT || '',
    shopSlug: process.env.SHOPIER_SHOP_SLUG || '',
    webhookToken: process.env.SHOPIER_WEBHOOK_TOKEN || '',
    productImageUrl: process.env.SHOPIER_PRODUCT_IMAGE_URL || defaultImage,
    configured: isShopierConfigured(),
  };
}

function formatAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '0.00';
  return n.toFixed(2);
}

async function shopierFetch(path, { method = 'GET', body } = {}) {
  const { pat } = getShopierConfig();
  if (!pat) throw new Error('shopier_not_configured');

  const res = await fetch(`${SHOPIER_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || `shopier_http_${res.status}`;
    const err = new Error(typeof msg === 'string' ? msg : 'shopier_api_error');
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

/**
 * Create a one-off digital Shopier product and return hosted-checkout form fields.
 * Buyer POSTs to Shopier shipping checkout with product_id.
 */
export async function createShopierCheckout({
  orderId,
  amount,
  currency = 'TRY',
  productName,
  description,
}) {
  const { shopSlug, productImageUrl } = getShopierConfig();
  if (!isShopierConfigured()) throw new Error('shopier_not_configured');

  const title = String(productName || 'Premium').slice(0, 150);
  const note = String(orderId || '').slice(0, 200);

  const product = await shopierFetch('/products', {
    method: 'POST',
    body: {
      title,
      description: String(description || title).slice(0, 2000),
      type: 'digital',
      shippingPayer: 'sellerPays',
      priceData: {
        currency: currency || 'TRY',
        price: formatAmount(amount),
      },
      media: [
        {
          type: 'image',
          url: productImageUrl,
          placement: 1,
        },
      ],
      stockQuantity: 1,
      customListing: true,
      customNote: note,
    },
  });

  if (!product?.id) throw new Error('shopier_product_missing_id');

  return {
    productId: String(product.id),
    paymentUrl: product.url || `https://www.shopier.com/${product.id}`,
    actionUrl: `https://www.shopier.com/s/shipping/${encodeURIComponent(shopSlug)}`,
    fields: {
      product_id: String(product.id),
      quantity: '1',
    },
  };
}

/** Best-effort cleanup of ephemeral payment products. */
export async function deleteShopierProduct(productId) {
  if (!productId || !isShopierConfigured()) return;
  try {
    await shopierFetch(`/products/${encodeURIComponent(String(productId))}`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.warn('[shopier] product delete failed', productId, e?.message || e);
  }
}

/**
 * Verify Shopier REST webhook (HMAC-SHA256 of raw body with webhook token).
 * Signature header: Shopier-Signature (hex or base64).
 */
export function verifyShopierWebhook({ rawBody, headers, token = process.env.SHOPIER_WEBHOOK_TOKEN }) {
  if (!token) return { ok: false, error: 'webhook_not_configured' };

  const signature = getHeader(headers, 'shopier-signature');
  if (!signature) return { ok: false, error: 'missing_signature' };

  const body = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody || '').toString('utf8');
  const expectedHex = crypto.createHmac('sha256', token).update(body).digest('hex');
  const expectedB64 = crypto.createHmac('sha256', token).update(body).digest('base64');

  if (!timingSafeEqualStr(expectedHex, signature) && !timingSafeEqualStr(expectedB64, signature)) {
    return { ok: false, error: 'invalid_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  const eventType = getHeader(headers, 'shopier-event') || payload?.event || payload?.type || '';
  const webhookId = getHeader(headers, 'shopier-webhook-id') || payload?.id || null;

  return {
    ok: true,
    eventType: String(eventType),
    webhookId: webhookId ? String(webhookId) : null,
    payload,
  };
}

function getHeader(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(name.toLowerCase()) || undefined;
  }
  const lower = name.toLowerCase();
  const entry = Object.entries(headers).find(([k]) => k.toLowerCase() === lower);
  if (!entry) return undefined;
  return Array.isArray(entry[1]) ? entry[1][0] : entry[1];
}

function timingSafeEqualStr(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function siteBaseUrl(request) {
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'http://localhost:3000';
  }
}
