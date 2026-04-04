/**
 * generateManifest — Node.js generator, called from vite.config.ts.
 *
 * Reads package.json for real stack versions, scans src/ recursively,
 * and writes public/PROJECT_MANIFEST.json so agents always have fresh context.
 */

import fs   from 'node:fs';
import path from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectManifest {
  project_identity: {
    name:    string;
    version: string;
    stack:   Record<string, string>;
  };
  file_system_map:     string[];
  rules_of_engagement: string[];
  bundler_constraints: {
    allowed_extensions:          string[];
    forbidden_in_result_files:   string[];
    reason:                      string;
    init_required:               string;
  };
  protected_files:     string[];
  last_scan_timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scanDir(dir: string, base: string): string[] {
  const result: string[] = [];
  const SKIP = new Set(['node_modules', 'dist', '.git', '.vite']);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...scanDir(full, base));
    } else {
      result.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return result;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateManifest(cwd: string = process.cwd()): void {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'),
  ) as {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const tracked = [
    'react', 'react-dom', 'typescript', 'vite', 'tailwindcss',
    'esbuild-wasm', '@supabase/supabase-js', 'framer-motion', 'lucide-react',
  ];
  const stack: Record<string, string> = {};
  for (const k of tracked) {
    if (allDeps[k]) stack[k] = allDeps[k].replace(/^\^|~/, '');
  }

  const srcDir = path.join(cwd, 'src');
  const files  = fs.existsSync(srcDir) ? scanDir(srcDir, srcDir) : [];

  const manifest: ProjectManifest = {
    project_identity: {
      name:    pkg.name    ?? 'app',
      version: pkg.version ?? '0.0.0',
      stack,
    },
    file_system_map: files,
    rules_of_engagement: [
      'No MVP shortcuts',
      'No any types',
      'SOLID principles',
      'Framer Motion for transitions',
      'esbuild-wasm only, no Babel',
    ],
    bundler_constraints: {
      allowed_extensions:        ['.tsx', '.ts', '.css'],
      forbidden_in_result_files: ['.sql', '.json', '.md', '.png', '.svg'],
      reason:                    'esbuild-wasm only processes JS/TS/CSS files',
      init_required:             'initBundler() must be called in main.tsx before render',
    },
    protected_files: [
      'src/lib/supabase.ts',
      'src/services/ConfigService.ts',
      'src/lib/bundler.ts',
      'src/scripts/generateManifest.ts',
      'vite.config.ts',
      'package.json',
      'tsconfig.json',
      'public/PROJECT_MANIFEST.json',
      'supabase/migrations/',
    ],
    last_scan_timestamp: new Date().toISOString(),
  };

  const out = path.join(cwd, 'public', 'PROJECT_MANIFEST.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
  console.log('[manifest] Written →', path.relative(cwd, out));
}
