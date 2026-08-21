import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Resolve the caller from Authorization: Bearer <jwt>.
 * Never trusts client-sent user ids for authorization.
 */
export async function getRequestUser(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || (!publishable && !secret)) return null;

  // Prefer secret key for JWT validation (more reliable with newer Supabase key formats)
  const key = secret || publishable;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data?.user) return null;

  const user = data.user;
  const appRole = user.app_metadata?.role || null;

  // Profile lookup via admin/secret when available so RLS cannot hide the row
  const profileClient = secret
    ? createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
    : createClient(url, publishable, {
        global: { headers: { Authorization: `Bearer ${match[1]}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

  let profile = null;
  const { data: profileRow } = await profileClient
    .from('profiles')
    .select('id, role, status, full_name, phone_e164, preferred_language, preferred_currency')
    .eq('id', user.id)
    .maybeSingle();
  profile = profileRow;

  const role = appRole || profile?.role || 'student';
  const status = profile?.status || 'active';

  return {
    id: user.id,
    email: user.email,
    role,
    status,
    profile,
    accessToken: match[1],
    isAdmin: role === 'admin' && status === 'active',
    supabase,
  };
}

export function requireUser(user) {
  if (!user || user.status === 'suspended') return { error: 'auth_required', status: 401 };
  return null;
}

export function requireAdmin(user) {
  const base = requireUser(user);
  if (base) return base;
  if (!user.isAdmin) return { error: 'not_found', status: 404 }; // existence-hiding
  return null;
}

export function isMockMode() {
  if (process.env.MOCK_MODE === 'true') return true;
  if (process.env.MOCK_MODE === 'false') return false;
  // Production never falls back to insecure mock admin/data.
  if (process.env.NODE_ENV === 'production') return false;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function hashIp(ip) {
  const secret = process.env.IP_HASH_SECRET || 'dev-only-ip-hash';
  const crypto = require('crypto');
  return crypto.createHmac('sha256', secret).update(String(ip || '')).digest('hex').slice(0, 32);
}
