'use strict';
/**
 * restore-tool.js — Restore frontend/src from a Cloud Snapshot
 * Usage:  npm run tool:restore <backup-id>
 *
 * ⚠️  WARNING: This COMPLETELY OVERWRITES frontend/src with the saved snapshot.
 *     You have 3 seconds to press Ctrl+C to cancel.
 */

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

// ── Load .env from project root ───────────────────────────────────────────────
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

const SRC = path.join(ROOT, 'frontend', 'src');

// ── Countdown helper ──────────────────────────────────────────────────────────
function countdown(seconds) {
  return new Promise(resolve => {
    let remaining = seconds;
    const interval = setInterval(() => {
      process.stdout.write(`\r    Restoring in ${remaining}s... (Ctrl+C to cancel)  `);
      remaining--;
      if (remaining < 0) {
        clearInterval(interval);
        process.stdout.write('\n');
        resolve();
      }
    }, 1000);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const backupId = process.argv[2];

  console.log('');
  console.log('↩️   AIC-RG Studio — Cloud Restore');
  console.log('────────────────────────────────');

  if (!backupId) {
    console.error('❌  No backup ID provided.');
    console.error('    Usage: npm run tool:restore <backup-id>');
    console.error('');
    console.error('    To list recent backups, run:');
    console.error('    npm run tool:list');
    process.exit(1);
  }

  // Validate UUID format before hitting the network
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(backupId)) {
    console.error('❌  Invalid ID format. Expected a UUID like:');
    console.error('    a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    process.exit(1);
  }

  console.log(`🔍  Fetching backup ${backupId}...`);

  const { data, error } = await supabase
    .from('tool_backups')
    .select('id, created_at, comment, source_code')
    .eq('id', backupId)
    .single();

  if (error || !data) {
    console.error('❌  Backup not found:', error?.message ?? 'no data returned');
    process.exit(1);
  }

  const files     = data.source_code;
  const fileCount = Object.keys(files).length;

  console.log('');
  console.log('    Backup info:');
  console.log(`    ├─ Comment:  ${data.comment || '(none)'}`);
  console.log(`    ├─ Saved at: ${data.created_at}`);
  console.log(`    └─ Files:    ${fileCount}`);
  console.log('');
  console.log('⚠️   This will COMPLETELY OVERWRITE frontend/src!');

  await countdown(3);

  // ── Wipe frontend/src ─────────────────────────────────────────────────────
  console.log('🗑️   Clearing frontend/src...');
  fs.rmSync(SRC, { recursive: true, force: true });
  fs.mkdirSync(SRC, { recursive: true });

  // ── Write files ───────────────────────────────────────────────────────────
  console.log('📂  Writing files...');
  let written = 0;
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(SRC, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    written++;
  }

  // ── Write .studio/sync_state.json ────────────────────────────────────────
  const studioDir   = path.join(ROOT, '.studio');
  const syncState   = path.join(studioDir, 'sync_state.json');
  fs.mkdirSync(studioDir, { recursive: true });
  fs.writeFileSync(syncState, JSON.stringify({
    last_snapshot_id: backupId,
    timestamp:        new Date().toISOString(),
    status:           'reverted',
  }, null, 2), 'utf8');

  console.log('');
  console.log(`✅  Restored ${written} files to frontend/src`);
  console.log(`🔒  Sync state written → .studio/sync_state.json`);
  console.log('    Restart your dev server (npm run dev) to apply changes.');
  console.log('');
}

main().catch(err => {
  console.error('❌  Unexpected error:', err.message);
  process.exit(1);
});
