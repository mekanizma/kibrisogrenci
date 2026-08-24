import { NextResponse } from 'next/server';
import { isMockMode } from '@/lib/auth';
import { siteBaseUrl } from '@/lib/shopier';
import { computePremiumUntil, getPremiumPlan } from '@/lib/premium';
import { LISTINGS } from '@/lib/seed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const mockOrders = globalThis.__koShopierOrders || new Map();
if (!globalThis.__koShopierOrders) globalThis.__koShopierOrders = mockOrders;

/**
 * Dev-only Shopier simulator. Only when MOCK_MODE=true.
 */
export async function POST(request) {
  if (!isMockMode()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const base = siteBaseUrl(request);
  const form = await request.formData().catch(() => null);
  const orderId = String(form?.get('platform_order_id') || '');
  const listingId = String(form?.get('listing_id') || '');
  const planId = String(form?.get('plan') || '');

  const order = mockOrders.get(orderId);
  if (order) {
    order.status = 'paid';
    order.paid_at = new Date().toISOString();
    order.shopier_payment_id = `mock-${Date.now()}`;
    mockOrders.set(orderId, order);
  } else if (orderId) {
    mockOrders.set(orderId, {
      platform_order_id: orderId,
      listing_id: listingId,
      plan_id: planId,
      amount: getPremiumPlan(planId)?.price_amount || 0,
      currency: 'TRY',
      status: 'paid',
      created_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      shopier_payment_id: `mock-${Date.now()}`,
      buyer_email: 'demo@kibrisogrenci.com',
    });
  }

  const plan = getPremiumPlan(planId || order?.plan_id);
  const lid = listingId || order?.listing_id;
  if (plan && lid) {
    const until = computePremiumUntil(plan.id);
    const target = LISTINGS.find((l) => l.id === lid);
    if (target) {
      target.premium_tier = plan.id;
      target.premium_until = until;
      target.featured = true;
    }
  }

  const q = new URLSearchParams({
    payment: 'success',
    order: orderId || 'mock',
    plan: plan?.id || planId || '',
  });
  return NextResponse.redirect(`${base}/?${q.toString()}`, 303);
}
