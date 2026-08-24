import { NextResponse } from 'next/server';
import { getRequestUser, requireUser, isMockMode } from '@/lib/auth';
import * as db from '@/lib/db';
import { getPremiumPlan } from '@/lib/premium';
import { isShopierConfigured } from '@/lib/shopier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** In-memory mock orders when MOCK_MODE=true */
const mockOrders = globalThis.__koShopierOrders || new Map();
if (!globalThis.__koShopierOrders) globalThis.__koShopierOrders = mockOrders;

export async function POST(request) {
  try {
    const user = await getRequestUser(request);
    const denied = requireUser(user);
    if (denied && !isMockMode()) return json(denied, denied.status);

    const body = await request.json().catch(() => ({}));
    const plan = getPremiumPlan(body.plan);
    if (!plan) return json({ error: 'invalid_plan' }, 400);
    if (!body.listing_id) return json({ error: 'invalid', detail: 'listing_id' }, 400);

    if (isMockMode() && !isShopierConfigured()) {
      // Dev mock: create fake form that posts back to our callback
      const orderId = `KOMOCK${Date.now().toString(36).toUpperCase()}`;
      mockOrders.set(orderId, {
        platform_order_id: orderId,
        user_id: user?.id || 'mock',
        listing_id: body.listing_id,
        plan_id: plan.id,
        amount: plan.price_amount,
        currency: plan.currency,
        status: 'pending',
        buyer_name: body.buyer_name || null,
        buyer_email: body.buyer_email || user?.email || 'demo@kibrisogrenci.com',
        buyer_phone: body.buyer_phone || null,
        created_at: new Date().toISOString(),
        paid_at: null,
        shopier_payment_id: null,
      });
      const origin = new URL(request.url).origin;
      return json({
        ok: true,
        mock: true,
        order: {
          id: orderId,
          platform_order_id: orderId,
          plan_id: plan.id,
          amount: plan.price_amount,
          currency: plan.currency,
          listing_id: body.listing_id,
        },
        shopier: {
          actionUrl: `${origin}/api/payments/shopier/mock-pay`,
          fields: {
            platform_order_id: orderId,
            plan: plan.id,
            listing_id: body.listing_id,
            amount: String(plan.price_amount),
            product_id: `mock-${orderId}`,
            quantity: '1',
          },
        },
      });
    }

    if (!user || denied) return json(denied || { error: 'auth_required' }, 401);

    const result = await db.dbCreateShopierCheckout(user, body);
    if (result.error) return json({ error: result.error, detail: result.detail || null }, result.status || 400);
    return json(result);
  } catch (e) {
    console.error('[shopier/create]', e);
    return json({ error: 'server_error' }, 500);
  }
}

export async function GET() {
  return json({
    configured: isShopierConfigured(),
    currency: 'TRY',
  });
}
