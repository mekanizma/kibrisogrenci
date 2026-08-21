import 'server-only';
// Service-role (secret key) client. SERVER ONLY. Bypasses RLS.
// Use ONLY for admin endpoints and scheduled jobs — never for ordinary requests.
import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error('Supabase admin env vars missing (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)');
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
