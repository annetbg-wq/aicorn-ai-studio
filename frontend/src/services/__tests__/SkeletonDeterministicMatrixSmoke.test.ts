import { describe, expect, it } from 'vitest';
import {
  buildSkeletonPromptBlock,
  getEditableSkeletonFiles,
  getSkeletonInstalledFiles,
  getSkeletonProductSlotFiles,
} from '../SkeletonRegistry';
import { getRawSkeletonManifest, listSkeletonContractIds } from '../SkeletonContractCompiler';
import { getSkeletonRuntimePolicy } from '../SkeletonRuntimePolicy';

describe('Skeleton deterministic matrix smoke — 14/14', () => {
  it('keeps Registry free of legacy file policy fields and raw manifest imports', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../SkeletonRegistry.ts', import.meta.url), 'utf8'));
    expect(source).not.toContain('lockedPrefixes:');
    expect(source).not.toContain('deltaFiles: string[]');
    expect(source).not.toContain("./skeleton-manifests/");
    expect(source).not.toContain('SKELETON_MANIFESTS');
  });

  it('keeps raw manifest reads outside runtime adapters', async () => {
    const fs = await import('node:fs/promises');
    const runtimeSources = [
      '../SkeletonRegistry.ts',
      '../SkeletonQualityContract.ts',
      '../SkeletonSelectionCompatibility.ts',
      '../SkeletonRuntimePolicy.ts',
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

  it.each(listSkeletonContractIds())('%s keeps Registry adapters aligned with the compiled contract', id => {
    const policy = getSkeletonRuntimePolicy(id);
    const installed = getSkeletonInstalledFiles(id);
    const editable = getEditableSkeletonFiles(id);
    const productSlots = getSkeletonProductSlotFiles(id);
    const prompt = buildSkeletonPromptBlock(id);

    expect(installed).toEqual(policy.infrastructure.installed);
    expect(editable).toEqual(policy.editable);
    expect(productSlots).toEqual(policy.editable);

    for (const path of policy.requiredSlots) {
      expect(editable, `${id}: required slot missing from editable adapter: ${path}`).toContain(path);
      expect(prompt, `${id}: coder prompt missing canonical required slot: ${path}`).toContain(path);
    }

    for (const path of policy.optionalSlots) {
      expect(editable, `${id}: optional slot missing from editable adapter: ${path}`).toContain(path);
      expect(prompt, `${id}: coder prompt should advertise optional editable slot: ${path}`).toContain(path);
    }

    for (const protectedPath of policy.infrastructure.protected) {
      expect(prompt, `${id}: coder prompt missing protected contract: ${protectedPath}`).toContain(protectedPath);
    }
  });

  it('does not make optional routes mandatory in the compiled contract', () => {
    for (const id of ['saas-dashboard', 'social-community', 'productivity-tool', 'ecommerce'] as const) {
      const policy = getSkeletonRuntimePolicy(id);
      expect(policy.optionalSlots).toContain('src/config/routes.ts');
      expect(policy.requiredSlots).not.toContain('src/config/routes.ts');
    }
  });

  it('keeps mobile routes mandatory, editable and not reusable', () => {
    const policy = getSkeletonRuntimePolicy('mobile-app');
    expect(policy.requiredSlots).toContain('src/config/routes.ts');
    expect(policy.editable).toContain('src/config/routes.ts');
    expect(policy.reusable).not.toContain('src/config/routes.ts');
  });
});
