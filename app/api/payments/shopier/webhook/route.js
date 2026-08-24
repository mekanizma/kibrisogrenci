import { NextResponse } from 'next/server';
import * as db from '@/lib/db';
import { isShopierWebhookConfigured, verifyShopierWebhook } from '@/lib/shopier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Shopier REST webhook (order.created).
 * Registered via API → url: /api/payments/shopier/webhook
 * Verifies Shopier-Signature with SHOPIER_WEBHOOK_TOKEN.
 */
export async function POST(request) {
  try {
    if (!isShopierWebhookConfigured()) {
      console.error('[shopier/webhook] SHOPIER_WEBHOOK_TOKEN missing');
      return NextResponse.json({ error: 'not_configured' }, { status: 503 });
    }

    const rawBody = await request.text();
    const verified = verifyShopierWebhook({
      rawBody,
      headers: request.headers,
    });

    if (!verified.ok) {
      console.error('[shopier/webhook] verify failed', verified.error);
      return NextResponse.json({ error: verified.error }, { status: 401 });
    }

    const eventType = verified.eventType;
    if (eventType && eventType !== 'order.created') {
      return NextResponse.json({ ok: true, ignored: true, event: eventType });
    }

    const orderPayload = verified.payload;
    // Payload may be the order itself, or { data: order }
    const shopierOrder = orderPayload?.lineItems
      ? orderPayload
      : (orderPayload?.data || orderPayload?.order || orderPayload);

    const result = await db.dbFulfillShopierWebhookOrder(shopierOrder, {
      webhook_id: verified.webhookId,
      event: eventType,
    });

    if (result.error === 'order_not_found') {
      console.warn('[shopier/webhook] order not found for products', shopierOrder?.lineItems);
      // Still 200 so Shopier does not retry forever for unknown products
      return NextResponse.json({ ok: false, error: 'order_not_found' }, { status: 200 });
    }
    if (result.error) {
      console.error('[shopier/webhook]', result.error);
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json({
      ok: true,
      paid: !!result.paid,
      platform_order_id: result.platform_order_id || null,
    });
  } catch (e) {
    console.error('[shopier/webhook]', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'shopier_webhook' });
}
