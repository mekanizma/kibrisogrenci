// WhatsApp service placeholder (PROMPT 4). The real inbound webhook with
// X-Hub-Signature-256 HMAC verification, dedup on wa_message_id, opt-out
// handling, 24h window + templates, and cost ceilings is implemented in the
// Next.js API route /api/whatsapp/webhook. In production this service can host
// the long-running send-queue / template dispatch worker.
const log = (o) => console.log(JSON.stringify({ ts: new Date().toISOString(), svc: 'whatsapp', ...o }));
log({ status: 'started', note: 'webhook served by web /api/whatsapp/webhook' });
setInterval(() => log({ status: 'heartbeat' }), 5 * 60 * 1000);
