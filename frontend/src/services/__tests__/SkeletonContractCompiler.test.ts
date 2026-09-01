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

// Runtime consumers use only the semantic compiled contract; raw manifests stay schema/test-only.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const expectedSkeletonIds: SkeletonId[] = [
  'mobile-app',
  'super-app',
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

describe('Skeleton Contract Compiler — 15/15 matrix gate', () => {
  it('covers every registered skeleton family exactly once', () => {
    expect([...listSkeletonContractIds()].sort()).toEqual([...expectedSkeletonIds].sort());
  });

  it.each(expectedSkeletonIds)('%s is a native schema-v2 manifest without legacy editable mirrors', id => {
    const manifest = getRawSkeletonManifest(id) as unknown as Record<string, unknown>;
    expect(manifest.version).toBe(2);
    const ownership = manifest.ownership as Record<string, unknown>;
    expect(ownership).not.toHaveProperty('agentEditable');
    expect(manifest).not.toHaveProperty('editableFiles');
    expect(manifest).not.toHaveProperty('deltaFiles');
  });

  it.each(expectedSkeletonIds)('%s compiles into one semantic runtime contract', id => {
    const contract = compileSkeletonContract(id);
    const manifest = getRawSkeletonManifest(id);

    expect(contract.version).toBe(2);
    expect(contract.id).toBe(id);
    expect(contract.requiredSlots.length).toBeGreaterThan(0);
    expect(contract.editable).toEqual([...new Set([...contract.requiredSlots, ...contract.optionalSlots])]);
    expect(contract.infrastructure.installed.length).toBeGreaterThan(0);
    expect(contract.quality.minMeaningfulScreens).toBeGreaterThan(0);
    expect(contract.quality.requiredCapabilities.length).toBeGreaterThan(0);
    expect(contract.quality.requiredFlows.length).toBeGreaterThan(0);
    expect(contract.selection.productTypes.length).toBeGreaterThan(0);

    for (const requiredPath of contract.requiredSlots) {
      expect(contract.optionalSlots).not.toContain(requiredPath);
      expect(pathExists(id, requiredPath), `${id} missing required product slot ${requiredPath}`).toBe(true);
    }

    for (const optionalPath of contract.optionalSlots) {
      expect(pathExists(id, optionalPath), `${id} missing optional product slot ${optionalPath}`).toBe(true);
    }

    for (const protectedPath of contract.infrastructure.protected) {
      expect(pathExists(id, protectedPath), `${id} protected path does not exist: ${protectedPath}`).toBe(true);
    }

    expect(new Set(contract.editable).size).toBe(contract.editable.length);
    expect(new Set(contract.requiredSlots).size).toBe(contract.requiredSlots.length);
    expect(new Set(contract.optionalSlots).size).toBe(contract.optionalSlots.length);
    expect(manifest.id).toBe(id);
  });

  it('exposes only canonical semantic fields at runtime', () => {
    const contract = compileSkeletonContract('mobile-app') as unknown as Record<string, unknown>;
    for (const removedAlias of [
      'workingGroups',
      'requiredProductSlots',
      'optionalProductSlots',
      'agentEditable',
      'agentReadOnly',
      'protectedFiles',
      'skeletonOwned',
      'carcassFiles',
      'requiredExports',
    ]) {
      expect(contract).not.toHaveProperty(removedAlias);
    }
  });

  it('makes editable-but-not-required routes explicit optional product slots', () => {
    expect(compileSkeletonContract('saas-dashboard').optionalSlots).toContain('src/config/routes.ts');
    expect(compileSkeletonContract('social-community').optionalSlots).toContain('src/config/routes.ts');
    expect(compileSkeletonContract('productivity-tool').optionalSlots).toContain('src/config/routes.ts');
    expect(compileSkeletonContract('ecommerce').optionalSlots).toContain('src/config/routes.ts');
  });

  it('treats mobile routes as required, editable and never reusable', () => {
    const contract = compileSkeletonContract('mobile-app');
    expect(contract.requiredSlots).toContain('src/config/routes.ts');
    expect(contract.optionalSlots).not.toContain('src/config/routes.ts');
    expect(contract.editable).toContain('src/config/routes.ts');
    expect(contract.reusable).not.toContain('src/config/routes.ts');
  });
});
