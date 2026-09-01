#!/usr/bin/env node
/**
 * Skeleton validator.
 *
 * Checks that act as a CI quality gate:
 *   1. No `: any` annotations in src/.
 *   2. No `console.*` calls in src/.
 *   3. Every tab in BOTTOM_TABS points at a route registered in App.tsx.
 *   4. Every route in route-manifest.json corresponds to a page file that exists.
 *   5. Page count and tab count in the manifest match the source.
 *   6. No hardcoded color literals in components (#fff, rgb(...), bg-white, text-black).
 *      Allowed: CSS vars, Tailwind semantic classes (primary, foreground, muted, ...).
 *
 * Run via:  npm run validate
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const srcDir = path.join(root, 'src');

const errors = [];
const ok = [];

// ----- helpers ---------------------------------------------------------------

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

// ----- collect source files --------------------------------------------------

const sourceFiles = [];
for await (const file of walk(srcDir)) {
  if (/\.(ts|tsx)$/.test(file)) sourceFiles.push(file);
}

// ----- check 1: no `: any` ---------------------------------------------------

const anyOffenders = [];
for (const file of sourceFiles) {
  const text = await readText(file);
  // strip line comments and block comments before scanning
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // match `: any` not followed by a word char (so `: anyone` is OK)
  if (/:\s*any(?![\w$])/.test(stripped)) anyOffenders.push(rel(file));
}
if (anyOffenders.length) {
  errors.push(`[any] found in: ${anyOffenders.join(', ')}`);
} else {
  ok.push('no `: any` types');
}

// ----- check 2: no console.* -------------------------------------------------

const consoleOffenders = [];
for (const file of sourceFiles) {
  const text = await readText(file);
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (/\bconsole\.(log|warn|error|info|debug)\s*\(/.test(stripped)) {
    consoleOffenders.push(rel(file));
  }
}
if (consoleOffenders.length) {
  errors.push(`[console] found in: ${consoleOffenders.join(', ')}`);
} else {
  ok.push('no console calls');
}

// ----- check 3 + 4 + 5: routes / tabs / manifest -----------------------------

const manifest = JSON.parse(await readText(path.join(srcDir, 'route-manifest.json')));
const routesTs = await readText(path.join(srcDir, 'config', 'routes.ts'));
const navTs = await readText(path.join(srcDir, 'config', 'navigation.ts'));
const appTsx = await readText(path.join(srcDir, 'App.tsx'));

// Routes registered in App.tsx (look for path={ROUTES.x})
const registeredRouteKeys = new Set();
for (const m of appTsx.matchAll(/path=\{ROUTES\.(\w+)\}/g)) registeredRouteKeys.add(m[1]);

// Routes declared in routes.ts
const declaredRouteKeys = new Set();
for (const m of routesTs.matchAll(/^\s*(\w+):\s*'\/[^']*'/gm)) declaredRouteKeys.add(m[1]);

// Tabs declared in navigation.ts (look for to: ROUTES.x)
const tabRouteKeys = [];
for (const m of navTs.matchAll(/to:\s*ROUTES\.(\w+)/g)) tabRouteKeys.push(m[1]);

const deadTabs = tabRouteKeys.filter((k) => !registeredRouteKeys.has(k));
if (deadTabs.length) {
  errors.push(`[dead-tabs] tabs point at unregistered routes: ${deadTabs.join(', ')}`);
} else {
  ok.push(`all ${tabRouteKeys.length} tabs reach a real route`);
}

// Every page referenced in manifest must exist on disk
const missingPages = [];
for (const route of manifest.routes) {
  try {
    await stat(path.join(root, route.page));
  } catch {
    missingPages.push(route.page);
  }
}
if (missingPages.length) {
  errors.push(`[manifest] missing page files: ${missingPages.join(', ')}`);
} else {
  ok.push(`manifest: all ${manifest.routes.length} pages exist`);
}

// Manifest tab count must match navigation.ts tab count
if (manifest.tabs.length !== tabRouteKeys.length) {
  errors.push(
    `[manifest] tabs out of sync: manifest=${manifest.tabs.length}, navigation.ts=${tabRouteKeys.length}`,
  );
} else {
  ok.push('manifest tabs match navigation.ts');
}

// Manifest route count must match the routes module
if (manifest.routes.length !== declaredRouteKeys.size) {
  errors.push(
    `[manifest] routes out of sync: manifest=${manifest.routes.length}, routes.ts=${declaredRouteKeys.size}`,
  );
} else {
  ok.push('manifest routes match routes.ts');
}

// ----- check 6: no hardcoded colors -----------------------------------------

const COLOR_BANNED = [
  /\btext-white\b/, /\btext-black\b/,
  /\bbg-white\b/, /\bbg-black\b/,
  /#[0-9a-fA-F]{3,8}\b(?!\s*\*\/)/,
  /\brgb\(\s*\d+\s+\d+\s+\d+/,
  /\brgba\(\s*\d/,
];

const colorOffenders = [];
for (const file of sourceFiles) {
  if (file.endsWith('index.css')) continue; // tokens live there
  const text = await readText(file);
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const re of COLOR_BANNED) {
    if (re.test(stripped)) {
      colorOffenders.push(`${rel(file)} :: ${re}`);
      break;
    }
  }
}
if (colorOffenders.length) {
  errors.push(`[colors] hardcoded colors in:\n  - ${colorOffenders.join('\n  - ')}`);
} else {
  ok.push('no hardcoded colors');
}

// ----- report ----------------------------------------------------------------

console.log('Skeleton validation');
console.log('───────────────────');
for (const line of ok) console.log(`✓ ${line}`);
for (const line of errors) console.log(`✗ ${line}`);

if (errors.length) {
  console.log(`\n${errors.length} error(s).`);
  process.exit(1);
}
console.log('\nAll checks passed.');
