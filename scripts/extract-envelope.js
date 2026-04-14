/**
 * extract-envelope.js — DEV / RECOVERY TOOL ONLY.
 *
 * NOT part of the normal preview runtime or build pipeline.
 * Use only to manually extract a JSON artifact envelope that was accidentally
 * written to preview-workspace/src/App.tsx during debugging or a corrupted session.
 *
 * Usage: node scripts/extract-envelope.js
 * Safe:  exits cleanly if App.tsx is not JSON.
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'preview-workspace', 'src');
const appFile = path.join(srcDir, 'App.tsx');
const raw = fs.readFileSync(appFile, 'utf8');

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  console.log('App.tsx is not JSON — nothing to extract.');
  process.exit(0);
}

const files = parsed?.artifact?.files || parsed?.files;
if (!files || !Array.isArray(files)) {
  console.log('No artifact envelope found.');
  process.exit(0);
}

console.log(`Extracting ${files.length} files from artifact envelope...`);

files.forEach(f => {
  const relPath = f.path.replace(/^src\//, '');
  const fullPath = path.join(srcDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, f.content, 'utf8');
  console.log(`  ✓ ${relPath}`);
});

console.log('Done. Preview-workspace should hot-reload now.');
