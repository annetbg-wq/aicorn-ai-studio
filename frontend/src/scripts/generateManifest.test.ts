/**
 * generateManifest drift-prevention tests.
 *
 * Verifies that the manifest is written to `public/PROJECT_MANIFEST.json`
 * (the gitignored asset directory) and never into `src/` or the repo root.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import { generateManifest } from './generateManifest';

describe('generateManifest — write-path contract', () => {
  const tempDirs: string[] = [];

  function makeTempWorkspace(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-drift-test-'));
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'test-app', version: '1.0.0', dependencies: { react: '^18.0.0' } }),
    );
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('writes to public/PROJECT_MANIFEST.json — the gitignored asset path', () => {
    const cwd = makeTempWorkspace();
    generateManifest(cwd);
    expect(fs.existsSync(path.join(cwd, 'public', 'PROJECT_MANIFEST.json'))).toBe(true);
  });

  it('does NOT write the manifest inside src/', () => {
    const cwd = makeTempWorkspace();
    generateManifest(cwd);
    expect(fs.existsSync(path.join(cwd, 'src', 'PROJECT_MANIFEST.json'))).toBe(false);
  });

  it('does NOT write the manifest at the workspace root', () => {
    const cwd = makeTempWorkspace();
    generateManifest(cwd);
    expect(fs.existsSync(path.join(cwd, 'PROJECT_MANIFEST.json'))).toBe(false);
  });

  it('output contains expected manifest fields', () => {
    const cwd = makeTempWorkspace();
    generateManifest(cwd);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(cwd, 'public', 'PROJECT_MANIFEST.json'), 'utf-8'),
    );
    expect(manifest).toHaveProperty('project_identity');
    expect(manifest).toHaveProperty('file_system_map');
    expect(manifest).toHaveProperty('protected_files');
    expect(manifest).toHaveProperty('last_scan_timestamp');
    expect(manifest.project_identity.name).toBe('test-app');
  });
});
