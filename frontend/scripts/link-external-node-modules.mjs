import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendDir, '..');
const frontendNodeModules = path.join(frontendDir, 'node_modules');
const rootNodeModules = path.join(repoRoot, 'node_modules');

if (!fs.existsSync(frontendNodeModules)) {
  process.exit(0);
}

try {
  if (fs.existsSync(rootNodeModules)) {
    const stat = fs.lstatSync(rootNodeModules);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(rootNodeModules);
      if (path.resolve(repoRoot, target) === frontendNodeModules) {
        process.exit(0);
      }
    }
    process.exit(0);
  }

  const relativeTarget = path.relative(repoRoot, frontendNodeModules);
  fs.symlinkSync(relativeTarget, rootNodeModules, 'junction');
  console.log(`[postinstall] linked ${rootNodeModules} -> ${relativeTarget}`);
} catch (error) {
  console.warn(`[postinstall] unable to link root node_modules: ${String(error)}`);
}
