import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const bankRoot = join(__dirname, '../prototype-bank');

async function seed() {
  const archetypes = ['consumer-feed', 'dashboard-workspace', 'scanner-app', 'assistant-chat', 'superapp-shell'];
  for (const id of archetypes) {
    const manifest = JSON.parse(readFileSync(join(bankRoot, 'archetypes', id, 'manifest.json'), 'utf-8'));
    const { error } = await supabase.from('prototype_archetypes').upsert({ id, name: manifest.name, description: manifest.description, manifest });
    if (error) console.error(`Error archetype ${id}:`, error.message);
    else console.log(`✓ archetype: ${id}`);
  }

  const domains = ['medicine', 'fintech', 'gaming', 'wellness', 'social', 'ai-tools'];
  for (const id of domains) {
    const manifest = JSON.parse(readFileSync(join(bankRoot, 'domains', id, 'manifest.json'), 'utf-8'));
    const { error } = await supabase.from('prototype_domains').upsert({ id, name: manifest.name, manifest });
    if (error) console.error(`Error domain ${id}:`, error.message);
    else console.log(`✓ domain: ${id}`);
  }

  const modules = ['auth', 'billing', 'feed', 'chat', 'analytics', 'search', 'onboarding', 'profile', 'settings', 'notifications'];
  for (const id of modules) {
    const manifestPath = join(bankRoot, 'modules', id, 'manifest.json');
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const { error } = await supabase.from('prototype_modules').upsert({ id, name: manifest.name, manifest });
      if (error) console.error(`Error module ${id}:`, error.message);
      else console.log(`✓ module: ${id}`);
    } catch { console.warn(`  skipped module ${id} (no manifest.json at root level)`); }
  }

  const coreManifest = JSON.parse(readFileSync(join(bankRoot, 'core', 'manifest.json'), 'utf-8'));
  const { error: coreErr } = await supabase.from('prototype_core').upsert({ id: 'core', manifest: coreManifest });
  if (coreErr) console.error('Error core:', coreErr.message);
  else console.log('✓ core layer');

  console.log('\n✅ Prototype bank seeded!');
}

seed().catch(console.error);
