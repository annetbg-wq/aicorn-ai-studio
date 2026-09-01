import { describe, expect, it } from 'vitest';
import { buildSkeletonPromptBlock } from '../SkeletonRegistry';
import {
  compileSkeletonContract,
  getRawSkeletonManifest,
  listSkeletonContractIds,
} from '../SkeletonContractCompiler';

describe('Skeleton deterministic matrix smoke — 15/15', () => {
  it('keeps Registry free of legacy file policy fields and raw manifest imports', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../SkeletonRegistry.ts', import.meta.url), 'utf8'));
    expect(source).not.toContain('lockedPrefixes:');
    expect(source).not.toContain('deltaFiles: string[]');
    expect(source).not.toContain("./skeleton-manifests/");
    expect(source).not.toContain('SKELETON_MANIFESTS');
  });

  it('keeps runtime consumers on compiled contracts rather than raw manifests', async () => {
    const fs = await import('node:fs/promises');
    const runtimeSources = [
      '../SkeletonRegistry.ts',
      '../ProductDeltaContract.ts',
      '../AppFirstQualityGate.ts',
      '../../shared/outputTruth.ts',
      '../LiveGenerationContractValidator.ts',
    ];

    for (const relativePath of runtimeSources) {
      const source = await fs.readFile(new URL(relativePath, import.meta.url), 'utf8');
      expect(source, `${relativePath} must consume the compiled contract`).not.toContain('getRawSkeletonManifest');
    }
  });

  it('keeps output truth thresholds on canonical compiled required slots', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../shared/outputTruth.ts', import.meta.url), 'utf8'));
    expect(source).toContain('.requiredSlots.map(normalizeProjectPath)');
    expect(source).not.toContain('fileContract.requiredProductSlots');
    expect(source).not.toContain('SKELETON_REGISTRY[skeletonId].deltaFiles');
  });

  it.each(listSkeletonContractIds())('%s has no legacy manifest file-policy mirrors', id => {
    const manifest = getRawSkeletonManifest(id) as unknown as Record<string, unknown>;
    expect(manifest).not.toHaveProperty('editableFiles');
    expect(manifest).not.toHaveProperty('deltaFiles');
  });

  it.each(listSkeletonContractIds())('%s keeps coder prompt aligned with the compiled contract', id => {
    const contract = compileSkeletonContract(id);
    const prompt = buildSkeletonPromptBlock(id);

    for (const path of contract.requiredSlots) {
      expect(contract.editable, `${id}: required slot missing from canonical editable scope: ${path}`).toContain(path);
      expect(prompt, `${id}: coder prompt missing canonical required slot: ${path}`).toContain(path);
    }

    for (const path of contract.optionalSlots) {
      expect(contract.editable, `${id}: optional slot missing from canonical editable scope: ${path}`).toContain(path);
      expect(prompt, `${id}: coder prompt should advertise optional editable slot: ${path}`).toContain(path);
    }

    for (const protectedPath of contract.infrastructure.protected) {
      expect(prompt, `${id}: coder prompt missing protected contract: ${protectedPath}`).toContain(protectedPath);
    }
  });

  it('does not make optional routes mandatory in the compiled contract', () => {
    for (const id of ['saas-dashboard', 'social-community', 'productivity-tool', 'ecommerce'] as const) {
      const contract = compileSkeletonContract(id);
      expect(contract.optionalSlots).toContain('src/config/routes.ts');
      expect(contract.requiredSlots).not.toContain('src/config/routes.ts');
    }
  });

  it('keeps mobile routes mandatory, editable and not reusable', () => {
    const contract = compileSkeletonContract('mobile-app');
    expect(contract.requiredSlots).toContain('src/config/routes.ts');
    expect(contract.editable).toContain('src/config/routes.ts');
    expect(contract.reusable).not.toContain('src/config/routes.ts');
  });
});
