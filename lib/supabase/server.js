import 'server-only';
// Server-side client that forwards the caller's JWT so RLS applies.
// This is the default path for all normal authenticated operations.
import { createClient } from '@supabase/supabase-js';

export function supabaseForToken(accessToken) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  return createClient(url, key, {
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
