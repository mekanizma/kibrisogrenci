/**
 * OTP delivery helpers.
 *
 * There is no reliable unlimited free SMS API for TR/KKTC production.
 * Delivery order:
 *   1) Twilio SMS — if TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER
 *      (Twilio trial includes free test credits)
 *   2) Generic webhook — if SMS_WEBHOOK_URL (POST JSON { to, message })
 *   3) Free fallback — email via existing SMTP (always free when SMTP_* is set)
 *   4) Dev mock — logs code server-side when nothing configured
 */
import { sendSystemMail, isMailConfigured } from '@/lib/mail';

export function normalizePhoneE164(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '').trim();
  if (!digits) return null;
  let p = digits.startsWith('+') ? digits : `+${digits.replace(/^\+/, '')}`;
  // Local TR/KKTC mobile: 05xx… → +905xx…
  if (/^0[5]\d{9}$/.test(p.replace('+', ''))) {
    p = `+9${p.replace('+', '')}`;
  }
  if (!/^\+[1-9]\d{9,14}$/.test(p)) return null;
  return p;
}

export function isTwilioConfigured() {
  return !!(
    process.env.TWILIO_ACCOUNT_SID
    && process.env.TWILIO_AUTH_TOKEN
    && process.env.TWILIO_FROM_NUMBER
  );
}

export function isSmsWebhookConfigured() {
  return !!process.env.SMS_WEBHOOK_URL;
}

async function sendTwilioSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`twilio_${res.status}:${text.slice(0, 200)}`);
  }
  return { channel: 'sms', provider: 'twilio' };
}

async function sendWebhookSms(to, body) {
  const url = process.env.SMS_WEBHOOK_URL;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.SMS_WEBHOOK_TOKEN
        ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ to, message: body, phone: to }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`sms_webhook_${res.status}`);
  return { channel: 'sms', provider: 'webhook' };
}

/**
 * @returns {{ ok: boolean, channel: 'sms'|'email'|'mock', provider?: string, detail?: string }}
 */
export async function deliverOtp({ phone, email, code, locale = 'tr' }) {
  const message = locale === 'tr'
    ? `Kibris Ogrenci dogrulama kodun: ${code}. 10 dk gecerli.`
    : `Your Kibris Ogrenci verification code: ${code}. Valid for 10 minutes.`;

  if (isTwilioConfigured()) {
    try {
      const r = await sendTwilioSms(phone, message);
      return { ok: true, ...r };
    } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', sms: 'twilio_failed', err: String(e?.message || e) }));
    }
  }

  if (isSmsWebhookConfigured()) {
    try {
      const r = await sendWebhookSms(phone, message);
      return { ok: true, ...r };
    } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', sms: 'webhook_failed', err: String(e?.message || e) }));
    }
  }

  // Free path: email via SMTP already configured for the project
  if (email && isMailConfigured()) {
    const subject = locale === 'tr' ? 'Telefon doğrulama kodun' : 'Your phone verification code';
    const mail = await sendSystemMail({
      to: email,
      subject,
      text: message,
      html: `<p style="font-family:sans-serif;font-size:16px">${locale === 'tr' ? 'Doğrulama kodun:' : 'Your code:'} <strong style="letter-spacing:2px;font-size:22px">${code}</strong></p><p style="color:#64748b;font-size:13px">${locale === 'tr' ? '10 dakika geçerlidir.' : 'Valid for 10 minutes.'}</p>`,
    });
    if (mail.ok) {
      return { ok: true, channel: 'email', provider: 'smtp', detail: 'sms_unavailable_email_fallback' };
    }
  }

  // Dev / no provider: keep flow testable
  console.warn(JSON.stringify({
    level: 'warn',
    sms: 'mock_otp',
    phone,
    code,
    hint: 'Configure TWILIO_* or SMTP_* to deliver OTP',
  }));
  return {
    ok: true,
    channel: 'mock',
    provider: 'console',
    detail: process.env.NODE_ENV === 'production' ? 'logged' : 'dev_console',
  };
}
