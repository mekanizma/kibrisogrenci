'use client';

import { createClient } from '@/lib/supabase/client';

let cachedToken = null;

export function setAccessToken(token) {
  cachedToken = token || null;
}

export function getAccessToken() {
  return cachedToken;
}

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = cachedToken;
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
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
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.user) {
    setAuth({ signedIn: false });
    setAccessToken(null);
    return null;
  }
  setAccessToken(session.access_token);
  const role = session.user.app_metadata?.role || 'student';
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
