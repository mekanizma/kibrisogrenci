'use client';
// Browser Supabase client — uses the publishable (anon) key. Auth flows only.
// RLS fully protects any read done directly from the browser.
import { createBrowserClient } from '@supabase/ssr';

let _client = null;
export function createClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  _client = createBrowserClient(url, key);
  return _client;
}
