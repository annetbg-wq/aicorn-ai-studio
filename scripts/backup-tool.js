'use strict';
/**
 * backup-tool.js — Cloud Snapshot for frontend/src
 * Usage:  npm run tool:save "Comment describing the state"
 *
 * Requires table in Supabase:
 *   See scripts/create-table.sql
 */

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

// ── Load .env from project root (no external deps needed) ────────────────────
const ROOT = path.join(__dirname, '..');
try {
  const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
} catch { /* .env is optional */ }

// ── Supabase client ───────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL
  || 'https://zdzuaodphrlpvorutpyc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkenVhb2RwaHJscHZvcnV0cHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDIyMTIsImV4cCI6MjA4NzUxODIxMn0.7L5sYMedvIKnU7o0X280Y92rUTAs86Q4RwBJsppuFxI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── File collector ────────────────────────────────────────────────────────────
const SRC = path.join(ROOT, 'frontend', 'src');

function collectFiles(dir, base) {
  const result = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, collectFiles(full, base));
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      const rel = path.relative(base, full).replace(/\\/g, '/');
      result[rel] = fs.readFileSync(full, 'utf8');
    }
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const comment = process.argv[2] || '';

  console.log('');
  console.log('📸  AIC-RG Studio — Cloud Backup');
  console.log('────────────────────────────────');

  if (!fs.existsSync(SRC)) {
    console.error('❌  frontend/src not found at:', SRC);
    process.exit(1);
  }

  console.log('🔍  Scanning frontend/src...');
  const source_code = collectFiles(SRC, SRC);
  const fileCount   = Object.keys(source_code).length;

  if (fileCount === 0) {
    console.error('❌  No .ts/.tsx/.css files found — nothing to back up.');
    process.exit(1);
  }

  const sizeKb = Math.round(JSON.stringify(source_code).length / 1024);
  console.log(`    ${fileCount} files, ~${sizeKb} KB`);
  if (comment) console.log(`    Comment: "${comment}"`);

  console.log('☁️   Uploading to Supabase...');

  const { data, error } = await supabase
    .from('tool_backups')
    .insert([{ source_code, comment }])
    .select('id, created_at')
    .single();

  if (error) {
    console.error('❌  Supabase error:', error.message);
    console.error('    Hint: make sure the table exists — run scripts/create-table.sql');
    process.exit(1);
  }

  console.log('');
  console.log('✅  Backup created!');
  console.log('    ID:     ', data.id);
  console.log('    Saved:  ', data.created_at);
  console.log('');
  console.log('↩️   Restore with:');
  console.log(`    npm run tool:restore ${data.id}`);
  console.log('');
}

main().catch(err => {
  console.error('❌  Unexpected error:', err.message);
  process.exit(1);
});
