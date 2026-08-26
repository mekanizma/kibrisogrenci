import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const REF = 'gglvjbajtthsczofgjdz';

function loadEnv() {
  const p = path.join(root, '.env.local');
  if (!fs.existsSync(p)) return {};
  const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function readCliToken() {
  try {
    return execSync('powershell -NoProfile -File scripts/_read-cred.ps1', {
      cwd: root,
      encoding: 'utf8',
    }).trim() || null;
  } catch {
    return null;
  }
}

async function verify(env) {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await admin.from('listings').select('roommate_criteria').limit(1);
  return !error;
}

async function applyWithApi(token, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${body.slice(0, 400)}`);
}

async function applyWithPg(password, sql) {
  const pg = (await import('pg')).default;
  const urls = [
    process.env.DATABASE_URL,
    `postgresql://postgres.${REF}:${encodeURIComponent(password)}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:${encodeURIComponent(password)}@db.${REF}.supabase.co:5432/postgres`,
  ].filter(Boolean);
  for (const url of urls) {
    const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      await client.query(sql);
      await client.end();
      return;
    } catch (e) {
      try { await client.end(); } catch { /* ignore */ }
    }
  }
  throw new Error('postgres connection failed');
}

async function main() {
  const env = loadEnv();
  if (await verify(env)) {
    console.log('roommate_criteria column already exists.');
    return;
  }

  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/0019_roommate_criteria.sql'), 'utf8');
  const token = process.env.SUPABASE_ACCESS_TOKEN || readCliToken();
  const password = process.env.SUPABASE_DB_PASSWORD;

  if (token) {
    try {
      await applyWithApi(token, sql);
      if (await verify(env)) {
        console.log('Migration 0019 applied via Supabase Management API.');
        return;
      }
    } catch (e) {
      console.warn('Management API:', e.message);
    }
  }

  if (password) {
    try {
      await applyWithPg(password, sql);
      if (await verify(env)) {
        console.log('Migration 0019 applied via postgres.');
        return;
      }
    } catch (e) {
      console.warn('Postgres:', e.message);
    }
  }

  console.error(`
Could not apply migration automatically.
Open SQL Editor and run supabase/scripts/apply_roommate_criteria.sql:
https://supabase.com/dashboard/project/${REF}/sql/new
`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
