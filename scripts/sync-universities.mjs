/**
 * Sync UNI_CATALOG → live Supabase universities table.
 * Upserts by slug, activates catalog rows, deactivates orphans not in catalog.
 *
 * Usage: node --input-type=module scripts/sync-universities.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { UNI_CATALOG } from '../lib/universities.js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
  process.exit(1);
}

const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const catalogSlugs = new Set(UNI_CATALOG.map((u) => u.slug));

function pointWkt(lat, lng) {
  if (lat == null || lng == null) return null;
  return `SRID=4326;POINT(${Number(lng)} ${Number(lat)})`;
}

async function main() {
  console.log(`Syncing ${UNI_CATALOG.length} universities…`);

  for (const u of UNI_CATALOG) {
    const payload = {
      name_tr: u.name_tr,
      name_en: u.name_en,
      slug: u.slug,
      city: u.city,
      student_count_estimate: u.students ?? null,
      coordinates_verified: true,
      is_active: true,
      campus_location: pointWkt(u.lat, u.lng),
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await admin
      .from('universities')
      .select('id')
      .eq('slug', u.slug)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await admin.from('universities').update(payload).eq('id', existing.id);
      if (error) throw error;
      console.log('updated', u.slug);
    } else {
      const { error } = await admin.from('universities').insert(payload);
      if (error) throw error;
      console.log('inserted', u.slug);
    }
  }

  // Deactivate rows not in catalog (e.g. old kibris-ilim-universitesi)
  const { data: all, error: listErr } = await admin
    .from('universities')
    .select('id, slug, is_active, name_tr');
  if (listErr) throw listErr;

  let deactivated = 0;
  for (const row of all || []) {
    if (!catalogSlugs.has(row.slug) && row.is_active !== false) {
      const { error } = await admin
        .from('universities')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw error;
      console.log('deactivated', row.slug, row.name_tr);
      deactivated += 1;
    }
  }

  const { count } = await admin
    .from('universities')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  console.log(JSON.stringify({
    catalog: UNI_CATALOG.length,
    active_in_db: count,
    deactivated,
  }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
