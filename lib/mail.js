/**
 * System email via SMTP (same host as Supabase Auth SMTP).
 * Auth emails still go through Supabase; this sends app notifications
 * (new message, listing review, etc.).
 *
 * Env:
 *   SMTP_HOST=smtp.mnic.tr
 *   SMTP_PORT=587
 *   SMTP_USER=...
 *   SMTP_PASS=...
 *   SMTP_FROM="Kıbrıs Öğrenci <noreply@yourdomain>"
 *   SMTP_SECURE=false   (STARTTLS on 587)
 */
import nodemailer from 'nodemailer';

const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL || 'https://kibrisogrenci.com').replace(/\/$/, '');

export function isMailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function fromAddress() {
  return (
    process.env.SMTP_FROM
    || process.env.SMTP_USER
    || 'noreply@kibrisogrenci.com'
  );
}

let transporterPromise = null;

function getTransporter() {
  if (!isMailConfigured()) return null;
  if (!transporterPromise) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        requireTLS: !secure && port === 587,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          // STARTTLS; keep default verification unless explicitly relaxed
          minVersion: 'TLSv1.2',
        },
      }),
    );
  }
  return transporterPromise;
}

export async function verifySmtp() {
  if (!isMailConfigured()) {
    return { ok: false, detail: 'SMTP not configured' };
  }
  try {
    const t = await getTransporter();
    await t.verify();
    return { ok: true, detail: `${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}` };
  } catch (e) {
    return { ok: false, detail: String(e?.message || e) };
  }
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
export async function sendSystemMail({ to, subject, text, html }) {
  if (!to || !subject) return { ok: false, skipped: true, reason: 'invalid' };
  if (!isMailConfigured()) {
    console.warn(JSON.stringify({ level: 'warn', mail: 'skipped', reason: 'not_configured', to, subject }));
    return { ok: false, skipped: true, reason: 'not_configured' };
  }
  try {
    const t = await getTransporter();
    const info = await t.sendMail({
      from: fromAddress(),
      to,
      subject,
      text,
      html: html || undefined,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', mail: 'send_failed', err: String(e?.message || e), to, subject }));
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Fire-and-forget wrapper — never throws to callers. */
export function notifyAsync(fn) {
  Promise.resolve()
    .then(fn)
    .catch((e) => {
      console.error(JSON.stringify({ level: 'error', mail: 'notify_async', err: String(e?.message || e) }));
    });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout({ title, bodyHtml, ctaLabel, ctaUrl }) {
  const url = ctaUrl || siteUrl();
  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f6f4f0;font-family:Segoe UI,Arial,sans-serif;color:#0a3d54;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:linear-gradient(135deg,#0a4d68,#0c6d7c);padding:20px 24px;">
      <div style="color:#fff;font-size:18px;font-weight:700;">Kıbrıs Öğrenci</div>
      <div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:4px;">${escapeHtml(title)}</div>
    </div>
    <div style="padding:24px;font-size:15px;line-height:1.55;color:#334155;">
      ${bodyHtml}
      <p style="margin:28px 0 0;">
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#0a4d68;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px;">
          ${escapeHtml(ctaLabel || 'Siteye git')}
        </a>
      </p>
    </div>
    <div style="padding:14px 24px;background:#f8fafc;font-size:11px;color:#94a3b8;">
      Bu bir sistem bildirimidir. Kıbrıs Öğrenci adına ödeme talep edilmez.
    </div>
  </div>
</body></html>`;
}

export async function notifyNewMessage({
  toEmail,
  recipientName,
  senderLabel,
  listingRef,
  listingTitle,
  preview,
}) {
  if (!toEmail) return { ok: false, skipped: true };
  const subject = listingRef
    ? `Yeni mesaj · #${listingRef}`
    : 'Yeni mesaj · Kıbrıs Öğrenci';
  const previewSafe = String(preview || '').slice(0, 280);
  const text = [
    `Merhaba${recipientName ? ` ${recipientName}` : ''},`,
    '',
    `${senderLabel || 'Bir kullanıcı'} sana mesaj gönderdi.`,
    listingRef || listingTitle
      ? `İlan: ${listingTitle || ''} ${listingRef ? `(#${listingRef})` : ''}`.trim()
      : null,
    '',
    previewSafe ? `“${previewSafe}”` : null,
    '',
    `Mesajları görüntüle: ${siteUrl()}`,
    '',
    '— Kıbrıs Öğrenci',
  ].filter((l) => l !== null).join('\n');

  const html = layout({
    title: 'Yeni mesajın var',
    ctaLabel: 'Mesajları aç',
    ctaUrl: siteUrl(),
    bodyHtml: `
      <p>Merhaba${recipientName ? ` <strong>${escapeHtml(recipientName)}</strong>` : ''},</p>
      <p><strong>${escapeHtml(senderLabel || 'Bir kullanıcı')}</strong> sana mesaj gönderdi.</p>
      ${(listingRef || listingTitle) ? `<p style="color:#64748b;font-size:13px;">İlan: ${escapeHtml(listingTitle || '')}${listingRef ? ` · #${escapeHtml(listingRef)}` : ''}</p>` : ''}
      ${previewSafe ? `<blockquote style="margin:16px 0;padding:12px 14px;background:#f1f5f9;border-radius:10px;border-left:3px solid #0a4d68;color:#0a3d54;">${escapeHtml(previewSafe)}</blockquote>` : ''}
    `,
  });

  return sendSystemMail({ to: toEmail, subject, text, html });
}

export async function notifyListingReview({
  toEmail,
  ownerName,
  action,
  listingRef,
  listingTitle,
  reason,
}) {
  if (!toEmail) return { ok: false, skipped: true };

  const labels = {
    approve: {
      subject: `İlanın yayınlandı · #${listingRef || ''}`,
      title: 'İlanın onaylandı',
      body: 'İlanın incelendi ve yayına alındı. Öğrenciler artık ilanı görebilir.',
    },
    reject: {
      subject: `İlan reddedildi · #${listingRef || ''}`,
      title: 'İlan reddedildi',
      body: 'İlanın inceleme sonucunda reddedildi.',
    },
    request_changes: {
      subject: `İlan için düzeltme istendi · #${listingRef || ''}`,
      title: 'Düzeltme gerekiyor',
      body: 'İlanın için düzeltme istendi. Panelinden düzenleyip tekrar incelemeye gönderebilirsin.',
    },
  };
  const L = labels[action] || labels.reject;
  const reasonBlock = reason ? `\n\nMesaj:\n${reason}` : '';
  const text = [
    `Merhaba${ownerName ? ` ${ownerName}` : ''},`,
    '',
    L.body,
    listingTitle || listingRef ? `İlan: ${listingTitle || ''} ${listingRef ? `(#${listingRef})` : ''}`.trim() : null,
    reason ? `Mesaj: ${reason}` : null,
    '',
    `İlan paneli: ${siteUrl()}`,
    '',
    '— Kıbrıs Öğrenci',
  ].filter((l) => l !== null).join('\n');

  const html = layout({
    title: L.title,
    ctaLabel: 'İlan paneline git',
    ctaUrl: siteUrl(),
    bodyHtml: `
      <p>Merhaba${ownerName ? ` <strong>${escapeHtml(ownerName)}</strong>` : ''},</p>
      <p>${escapeHtml(L.body)}</p>
      ${(listingTitle || listingRef) ? `<p style="color:#64748b;font-size:13px;">İlan: ${escapeHtml(listingTitle || '')}${listingRef ? ` · #${escapeHtml(listingRef)}` : ''}</p>` : ''}
      ${reason ? `<blockquote style="margin:16px 0;padding:12px 14px;background:#fff7ed;border-radius:10px;border-left:3px solid #f59e0b;color:#9a3412;white-space:pre-wrap;">${escapeHtml(reason)}</blockquote>` : ''}
    `,
  });

  return sendSystemMail({ to: toEmail, subject: L.subject.trim(), text, html });
}
