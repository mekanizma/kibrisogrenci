import { NextResponse } from 'next/server';
import { siteBaseUrl } from '@/lib/shopier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirect(url) {
  return NextResponse.redirect(url, 303);
}

/**
 * Legacy return URL (classic API callback).
 * PAT flow fulfills via /api/payments/shopier/webhook instead.
 * Keep this route so old panel configs / manual returns still land on the app.
 */
export async function POST(request) {
  const base = siteBaseUrl(request);
  try {
    const ctype = request.headers.get('content-type') || '';
    let orderId = '';
    if (ctype.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      orderId = String(body.platform_order_id || body.order || '');
    } else {
      const form = await request.formData().catch(() => null);
      orderId = form ? String(form.get('platform_order_id') || form.get('order') || '') : '';
    }
    const q = new URLSearchParams({ payment: 'success' });
    if (orderId) q.set('order', orderId);
    return redirect(`${base}/?${q.toString()}`);
  } catch {
    return redirect(`${base}/?payment=success`);
  }
}

export async function GET(request) {
  const base = siteBaseUrl(request);
  const url = new URL(request.url);
  const order = url.searchParams.get('order') || '';
  const q = new URLSearchParams({ payment: 'success' });
  if (order) q.set('order', order);
  return redirect(`${base}/?${q.toString()}`);
}
