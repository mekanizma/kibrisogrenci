'use client';
// Browser Supabase client — publishable (anon) key only.
// Uses localStorage sessions (SPA + Bearer API). Avoid @supabase/ssr cookies
// here because there is no auth middleware to refresh cookie chunks.
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

let _client = null;
export function createClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  _client = createSupabaseClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  });
  return _client;
}
