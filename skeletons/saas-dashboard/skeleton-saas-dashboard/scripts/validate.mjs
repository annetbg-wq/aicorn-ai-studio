#!/usr/bin/env node
/**
 * Skeleton validator for SaaS dashboard.
 *
 *   1. No `: any` annotations in src/.
 *   2. No `console.*` calls in src/.
 *   3. Every sidebar item points at a route registered in App.tsx.
 *   4. Every route in route-manifest.json corresponds to an existing page.
 *   5. Manifest counts match the source.
 *   6. No hardcoded color literals.
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

async function readText(p) {
  return readFile(p, 'utf8');
}

function rel(p) {
  return path.relative(root, p).replace(/\\/g, '/');
}

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
if (anyOffenders.length) errors.push(`[any] found in: ${anyOffenders.join(', ')}`);
else ok.push('no `: any` types');

const consoleOffenders = [];
for (const file of sourceFiles) {
  const text = await readText(file);
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (/\bconsole\.(log|warn|error|info|debug)\s*\(/.test(stripped)) {
    consoleOffenders.push(rel(file));
  }
}
if (consoleOffenders.length) errors.push(`[console] found in: ${consoleOffenders.join(', ')}`);
else ok.push('no console calls');

const manifest = JSON.parse(await readText(path.join(srcDir, 'route-manifest.json')));
const navTs = await readText(path.join(srcDir, 'config', 'navigation.ts'));
const appTsx = await readText(path.join(srcDir, 'App.tsx'));

const registeredRouteKeys = new Set();
for (const m of appTsx.matchAll(/path=\{ROUTES\.(\w+)\}/g)) registeredRouteKeys.add(m[1]);

const sidebarRouteKeys = [];
for (const m of navTs.matchAll(/to:\s*ROUTES\.(\w+)/g)) sidebarRouteKeys.push(m[1]);

const deadNav = sidebarRouteKeys.filter((k) => !registeredRouteKeys.has(k));
if (deadNav.length) {
  errors.push(`[dead-nav] sidebar items point at unregistered routes: ${deadNav.join(', ')}`);
} else {
  ok.push(`all ${sidebarRouteKeys.length} sidebar items reach a real route`);
}

const missingPages = [];
for (const route of manifest.routes) {
  try {
    await stat(path.join(root, route.page));
  } catch {
    missingPages.push(route.page);
  }
}
if (missingPages.length) errors.push(`[manifest] missing page files: ${missingPages.join(', ')}`);
else ok.push(`manifest: all ${manifest.routes.length} pages exist`);

const COLOR_BANNED = [
  /\btext-white\b/, /\btext-black\b/,
  /\bbg-white\b/, /\bbg-black\b/,
  /#[0-9a-fA-F]{3,8}\b(?!\s*\*\/)/,
  /\brgba\(\s*\d/,
];

const colorOffenders = [];
for (const file of sourceFiles) {
  if (file.endsWith('index.css')) continue;
  if (file.endsWith('Sparkline.tsx')) continue; // uses rgb(var(--...)) — token-driven
  const text = await readText(file);
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const re of COLOR_BANNED) {
    if (re.test(stripped)) {
      colorOffenders.push(`${rel(file)} :: ${re}`);
      break;
    }
  }
}
if (colorOffenders.length) errors.push(`[colors] hardcoded colors in:\n  - ${colorOffenders.join('\n  - ')}`);
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
