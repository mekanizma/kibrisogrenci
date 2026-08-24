import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const TTL_SEC = 60 * 60 * 24 * 7;
const ALLOWED_BUCKETS = new Set(['listing-photos', 'avatars']);
const signedCache = new Map(); // `${bucket}:${key}` -> { url, exp }

function isSafeStorageKey(key) {
  if (!key || typeof key !== 'string' || key.length > 512) return false;
  if (key.includes('..') || key.startsWith('/') || key.includes('\\')) return false;
  return /^[a-zA-Z0-9/_.,\-]+$/.test(key);
}

/** Avatars keys must be `{uuid}/filename` — blocks path tricks even if UUID is known. */
function isAvatarKeyShape(key) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-zA-Z0-9._\-]+$/i.test(key);
}

async function signedUrlFor(bucket, key) {
  const cacheKey = `${bucket}:${key}`;
  const now = Date.now();
  const cached = signedCache.get(cacheKey);
  if (cached && cached.exp > now) return cached.url;

  const admin = supabaseAdmin();
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(key, TTL_SEC);
  if (error || !data?.signedUrl) return null;
  signedCache.set(cacheKey, { url: data.signedUrl, exp: now + TTL_SEC * 1000 - 60_000 });
  return data.signedUrl;
}

/**
 * Redirects to a short-lived signed Storage URL.
 * listing-photos: public capability URLs (published listing display).
 * avatars: same capability model, but private cache headers + strict key shape
 * (Storage RLS still bypassed by design for <img> tags without Bearer).
 */
export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const key = sp.get('k');
  const bucket = sp.get('b') || 'listing-photos';
  if (!ALLOWED_BUCKETS.has(bucket) || !isSafeStorageKey(key)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (bucket === 'avatars' && !isAvatarKeyShape(key)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  try {
    const url = await signedUrlFor(bucket, key);
    if (!url) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const cacheControl =
      bucket === 'avatars'
        ? 'private, max-age=3600'
        : 'public, max-age=3600, stale-while-revalidate=86400';
    return NextResponse.redirect(url, {
      status: 307,
      headers: {
        'Cache-Control': cacheControl,
      },
    });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
