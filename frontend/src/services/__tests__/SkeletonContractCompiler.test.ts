import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compileSkeletonContract,
  getRawSkeletonManifest,
  listSkeletonContractIds,
} from '../SkeletonContractCompiler';
import type { SkeletonId } from '../SkeletonRegistry';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const expectedSkeletonIds: SkeletonId[] = [
  'mobile-app',
  'saas-dashboard',
  'landing-page',
  'social-community',
  'productivity-tool',
  'ecommerce',
  'b2b-operations-workspace',
  'marketplace-platform',
  'creator-editor-workspace',
  'dating-matching-app',
  'gaming-casino-app',
  'game-interactive-app',
  'booking-service-app',
  'content-learning-app',
];

function getSkeletonSrcRoot(id: SkeletonId): string {
  return path.join(repoRoot, 'skeletons', id, `skeleton-${id}`, 'src');
}

function pathExists(id: SkeletonId, manifestPath: string): boolean {
  const relative = manifestPath.replace(/^src\//, '');
  if (relative.endsWith('/**') || relative.endsWith('/*')) {
    const directory = relative.replace(/\/\*\*?$/, '');
    return fs.existsSync(path.join(getSkeletonSrcRoot(id), directory));
  }
  return fs.existsSync(path.join(getSkeletonSrcRoot(id), relative));
}

describe('Skeleton Contract Compiler — 14/14 matrix gate', () => {
  it('covers every registered skeleton family exactly once', () => {
    expect([...listSkeletonContractIds()].sort()).toEqual([...expectedSkeletonIds].sort());
  });

  it.each(expectedSkeletonIds)('%s compiles into a non-ambiguous runtime contract', id => {
    const contract = compileSkeletonContract(id);
    const manifest = getRawSkeletonManifest(id);

    expect(contract.version).toBe(2);
    expect(contract.id).toBe(id);
    expect(contract.requiredProductSlots.length).toBeGreaterThan(0);
    expect(contract.agentEditable).toEqual(expect.arrayContaining(contract.requiredProductSlots));

    for (const requiredPath of contract.requiredProductSlots) {
      expect(contract.optionalProductSlots).not.toContain(requiredPath);
      expect(pathExists(id, requiredPath), `${id} missing required product slot ${requiredPath}`).toBe(true);
    }

    for (const optionalPath of contract.optionalProductSlots) {
      expect(pathExists(id, optionalPath), `${id} missing optional product slot ${optionalPath}`).toBe(true);
    }

    for (const protectedPath of contract.protectedFiles) {
      expect(pathExists(id, protectedPath), `${id} protected path does not exist: ${protectedPath}`).toBe(true);
    }

    expect(new Set(contract.agentEditable).size).toBe(contract.agentEditable.length);
    expect(new Set(contract.requiredProductSlots).size).toBe(contract.requiredProductSlots.length);
    expect(new Set(contract.optionalProductSlots).size).toBe(contract.optionalProductSlots.length);
    expect(manifest.id).toBe(id);
  });

  it('makes editable-but-not-required routes explicit optional product slots', () => {
    expect(compileSkeletonContract('saas-dashboard').optionalProductSlots).toContain('src/config/routes.ts');
    expect(compileSkeletonContract('social-community').optionalProductSlots).toContain('src/config/routes.ts');
    expect(compileSkeletonContract('productivity-tool').optionalProductSlots).toContain('src/config/routes.ts');
  });

  it('treats mobile routes as required and never protected', () => {
    const contract = compileSkeletonContract('mobile-app');
    expect(contract.requiredProductSlots).toContain('src/config/routes.ts');
    expect(contract.agentEditable).toContain('src/config/routes.ts');
  });
});
