import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const previewSandboxDir = path.join(repoRoot, 'frontend', 'preview-sandbox');
const registryDir = path.join(previewSandboxDir, 'registry');
const projectsDir = path.join(registryDir, 'projects');
const projectsIndexPath = path.join(registryDir, 'projects-index.json');

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function removeDirectorySafe(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function main() {
  let removedProjectDirs = 0;
  let removedRevisionDirs = 0;

  await ensureDir(projectsDir);
  await ensureDir(registryDir);
  await ensureDir(previewSandboxDir);

  const projDefaultPath = path.join(projectsDir, 'proj_default');
  const projDefaultExists = await pathExists(projDefaultPath);

  const projectEntries = await fs.readdir(projectsDir, { withFileTypes: true });
  for (const entry of projectEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'proj_default') continue;

    const fullPath = path.join(projectsDir, entry.name);
    await removeDirectorySafe(fullPath);
    removedProjectDirs += 1;
  }

  const sandboxEntries = await fs.readdir(previewSandboxDir, { withFileTypes: true });
  for (const entry of sandboxEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'registry') continue;
    if (!entry.name.startsWith('mm')) continue;

    const fullPath = path.join(previewSandboxDir, entry.name);
    await removeDirectorySafe(fullPath);
    removedRevisionDirs += 1;
  }

  const nextIndex = {
    version: 1,
    projectIds: ['proj_default'],
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    projectsIndexPath,
    JSON.stringify(nextIndex, null, 2) + '\n',
    'utf8'
  );

  const remainingMmDirs = [];
  const sandboxEntriesAfter = await fs.readdir(previewSandboxDir, { withFileTypes: true });
  for (const entry of sandboxEntriesAfter) {
    if (entry.isDirectory() && entry.name.startsWith('mm')) {
      remainingMmDirs.push(entry.name);
    }
  }

  console.log(`Удалено папок проектов: ${removedProjectDirs}`);
  console.log(`Удалено папок ревизий: ${removedRevisionDirs}`);
  console.log(`proj_default найден: ${projDefaultExists ? 'да' : 'нет'}`);
  console.log(`projects-index.json: ${projectsIndexPath}`);
  console.log(`Осталось mm*-папок после очистки: ${remainingMmDirs.length}`);
  console.log('projects-index.json reset to proj_default only');
}

main().catch((error) => {
  console.error('Ошибка очистки registry:', error);
  process.exit(1);
});