#!/usr/bin/env node
/**
 * Skeleton validator for landing page.
 *   1. No `: any` annotations.
 *   2. No console.* calls.
 *   3. Manifest sections list all match section components on disk.
 *   4. No hardcoded colors.
 *   5. App.tsx renders every section listed in the manifest.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const srcDir = path.join(root, 'src');

const errors = [];
const ok = [];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function readText(p) { return readFile(p, 'utf8'); }
function rel(p) { return path.relative(root, p).replace(/\\/g, '/'); }

const sourceFiles = [];
for await (const file of walk(srcDir)) {
  if (/\.(ts|tsx)$/.test(file)) sourceFiles.push(file);
}

const anyOffenders = [];
for (const file of sourceFiles) {
  const text = await readText(file);
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (/:\s*any(?![\w$])/.test(stripped)) anyOffenders.push(rel(file));
}
if (anyOffenders.length) errors.push(`[any] ${anyOffenders.join(', ')}`);
else ok.push('no `: any` types');

const consoleOffenders = [];
for (const file of sourceFiles) {
  const text = await readText(file);
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (/\bconsole\.(log|warn|error|info|debug)\s*\(/.test(stripped)) consoleOffenders.push(rel(file));
}
if (consoleOffenders.length) errors.push(`[console] ${consoleOffenders.join(', ')}`);
else ok.push('no console calls');

const manifest = JSON.parse(await readText(path.join(srcDir, 'route-manifest.json')));
const appTsx = await readText(path.join(srcDir, 'App.tsx'));

const missingSections = [];
for (const section of manifest.sections) {
  // Footer lives at sections/Footer too; just verify component name appears in App.tsx
  if (!new RegExp(`<${section.component}\\b`).test(appTsx)) {
    missingSections.push(section.component);
  }
}
if (missingSections.length) errors.push(`[manifest] missing in App.tsx: ${missingSections.join(', ')}`);
else ok.push(`App.tsx renders all ${manifest.sections.length} sections`);

// section components on disk
const missingFiles = [];
for (const section of manifest.sections) {
  if (section.component === 'Hero' || section.component.startsWith('sections/')) continue;
  // ok
}
// simpler: confirm every file in sections/ exists
for (const section of manifest.sections) {
  try {
    await stat(path.join(srcDir, 'components', 'sections', `${section.component}.tsx`));
  } catch {
    missingFiles.push(section.component);
  }
}
if (missingFiles.length) errors.push(`[files] missing section files: ${missingFiles.join(', ')}`);
else ok.push('all section component files exist');

const COLOR_BANNED = [
  /\btext-white\b/, /\btext-black\b/,
  /\bbg-white\b/, /\bbg-black\b/,
  /#[0-9a-fA-F]{3,8}\b(?!\s*\*\/)/,
  /\brgba\(\s*\d/,
];
const colorOffenders = [];
for (const file of sourceFiles) {
  if (file.endsWith('index.css')) continue;
  const text = await readText(file);
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const re of COLOR_BANNED) {
    if (re.test(stripped)) { colorOffenders.push(`${rel(file)} :: ${re}`); break; }
  }
}
if (colorOffenders.length) errors.push(`[colors] ${colorOffenders.join('\n  - ')}`);
else ok.push('no hardcoded colors');

console.log('Skeleton validation');
console.log('───────────────────');
for (const line of ok) console.log(`✓ ${line}`);
for (const line of errors) console.log(`✗ ${line}`);

if (errors.length) {
  console.log(`\n${errors.length} error(s).`);
  process.exit(1);
}
console.log('\nAll checks passed.');
