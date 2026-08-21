'use client';

import { createClient } from '@/lib/supabase/client';

let cachedToken = null;

export function setAccessToken(token) {
  cachedToken = token || null;
}

export function getAccessToken() {
  return cachedToken;
}

/** Resolve a fresh access token from the live Supabase session (refresh if needed). */
export async function resolveAccessToken() {
  try {
    const supabase = createClient();
    if (!supabase) return cachedToken;

    const { data } = await supabase.auth.getSession();
    let session = data?.session || null;

    const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
    const needsRefresh = !session || (expiresAtMs && expiresAtMs < Date.now() + 90_000);
    if (needsRefresh) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed?.session || session;
    }

    const token = session?.access_token || null;
    if (token) cachedToken = token;
    return token || cachedToken;
  } catch {
    return cachedToken;
  }
}

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  // Always prefer a freshly resolved session token over a stale Authorization header.
  const token = await resolveAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    delete headers.Authorization;
    delete headers.authorization;
  }
  if (opts.body && !headers['Content-Type'] && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`/api/${path}`, { ...opts, headers });
}

export async function refreshSessionIntoAuth(setAuth) {
  const supabase = createClient();
  if (!supabase) {
    setAuth({ signedIn: false });
    setAccessToken(null);
    return null;
  }
  let { data } = await supabase.auth.getSession();
  let session = data?.session;
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 90_000) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data?.session || session;
  }
  if (!session?.user) {
    setAuth({ signedIn: false });
    setAccessToken(null);
    return null;
  }
  setAccessToken(session.access_token);
  const role = session.user.app_metadata?.role || session.user.user_metadata?.role || 'student';
  setAuth({
    signedIn: true,
    studentId: session.user.id,
    email: session.user.email,
    role,
    accessToken: session.access_token,
  });
  return session;
}

export async function signOutEverywhere(setAuth) {
  const supabase = createClient();
  if (supabase) await supabase.auth.signOut().catch(() => {});
  setAccessToken(null);
  setAuth({ signedIn: false });
}
