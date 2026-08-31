import fs from 'node:fs';

const file = 'frontend/src/services/SkeletonRegistry.ts';
let source = fs.readFileSync(file, 'utf8');

const ownershipInterface = `export interface SkeletonOwnershipContract {
  ownedBySkeleton: string[];
  productSlots: string[];
}

`;

const legacyOwnershipApi = `function deriveOwnedSkeletonShellFiles(manifest: SkeletonManifest | undefined): string[] {
  if (!manifest) return [];
  const explicit = manifest.ownership.skeletonOwned;
  if (explicit.length > 0) {
    return uniqueSorted(explicit);
  }

  return uniqueSorted(
    manifest.protectedFiles.filter(path => (
      path === 'src/App.tsx'
      || path === 'src/main.tsx'
      || path === 'src/index.css'
      || path === 'src/route-manifest.json'
      || /^src\\/components\\/(?:AppShell|BottomTabs|DashboardShell|Nav|NavigationShell|Sidebar|TopBar|Topbar)\\.tsx$/i.test(path)
    )),
  );
}

export function getSkeletonOwnershipContract(skeletonId: SkeletonId): SkeletonOwnershipContract {
  const manifest = SKELETON_MANIFESTS[skeletonId];
  return {
    ownedBySkeleton: deriveOwnedSkeletonShellFiles(manifest),
    productSlots: uniqueSorted(manifest?.ownership.agentEditable ?? []),
  };
}

export function getSkeletonOwnedShellFiles(skeletonId: SkeletonId): string[] {
  return getSkeletonOwnershipContract(skeletonId).ownedBySkeleton;
}

export function getSkeletonProductSlotFiles(skeletonId: SkeletonId): string[] {
  return getSkeletonOwnershipContract(skeletonId).productSlots;
}
`;

const directProductSlotApi = `export function getSkeletonProductSlotFiles(skeletonId: SkeletonId): string[] {
  const manifest = SKELETON_MANIFESTS[skeletonId];
  return uniqueSorted(manifest?.ownership.agentEditable ?? []);
}
`;

if (!source.includes(ownershipInterface)) {
  throw new Error('SkeletonOwnershipContract block not found exactly once');
}
if (!source.includes(legacyOwnershipApi)) {
  throw new Error('Legacy shell ownership API block not found exactly once');
}

source = source.replace(ownershipInterface, '');
source = source.replace(legacyOwnershipApi, directProductSlotApi);

for (const forbidden of [
  'SkeletonOwnershipContract',
  'deriveOwnedSkeletonShellFiles',
  'getSkeletonOwnershipContract',
  'getSkeletonOwnedShellFiles',
]) {
  if (source.includes(forbidden)) {
    throw new Error(`Legacy symbol still present after patch: ${forbidden}`);
  }
}

fs.writeFileSync(file, source, 'utf8');
