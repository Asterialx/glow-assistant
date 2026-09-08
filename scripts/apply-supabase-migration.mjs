/**
 * Apply supabase/migrations/001_glow_accounts_sync.sql
 *
 * Usage:
 *   node scripts/apply-supabase-migration.mjs
 *
 * Needs in .env.local:
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_DB_PASSWORD=...
 *   (optional) DATABASE_URL=postgresql://...
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...process.env, ...loadEnvLocal() };
const url = env.VITE_SUPABASE_URL || "";
const ref = url.replace(/^https?:\/\//, "").split(".")[0];
const password = env.SUPABASE_DB_PASSWORD || env.POSTGRES_PASSWORD || "";
const sqlPath = path.join(root, "supabase/migrations/001_glow_accounts_sync.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const candidates = [];
if (env.DATABASE_URL) candidates.push(env.DATABASE_URL);
if (ref && password) {
  candidates.push(
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
  );
}

if (!candidates.length) {
  console.error("Missing DATABASE_URL or VITE_SUPABASE_URL + SUPABASE_DB_PASSWORD in .env.local");
  process.exit(1);
}

let lastErr = null;
for (const connectionString of candidates) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12_000,
  });
  try {
    await client.connect();
    console.log("Connected:", connectionString.replace(/:[^:@/]+@/, ":***@"));
    await client.query(sql);
    console.log("Migration applied:", sqlPath);
    await client.end();
    process.exit(0);
  } catch (e) {
    lastErr = e;
    console.log("Failed:", e instanceof Error ? e.message : e);
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

console.error("\nCould not apply migration automatically.");
console.error("Open Supabase → SQL Editor → paste supabase/migrations/001_glow_accounts_sync.sql → Run.");
if (lastErr) console.error(lastErr);
process.exit(1);
