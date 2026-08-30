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
  it('keeps Registry free of legacy file policy fields', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../SkeletonRegistry.ts', import.meta.url), 'utf8'));
    expect(source).not.toContain('lockedPrefixes:');
    expect(source).not.toContain('deltaFiles: string[]');
  });

  it('keeps output truth thresholds on canonical required product slots', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../shared/outputTruth.ts', import.meta.url), 'utf8'));
    expect(source).toContain('fileContract.requiredProductSlots');
    expect(source).not.toContain('SKELETON_REGISTRY[skeletonId].deltaFiles');
  });

  it.each(listSkeletonContractIds())('%s has no legacy manifest file-policy mirrors', id => {
    const manifest = getRawSkeletonManifest(id) as unknown as Record<string, unknown>;
    expect(manifest).not.toHaveProperty('editableFiles');
    expect(manifest).not.toHaveProperty('deltaFiles');
  });

  it.each(listSkeletonContractIds())('%s keeps installed/editable/prompt semantics aligned with canonical policy', id => {
    const policy = getSkeletonRuntimePolicy(id);
    const installed = getSkeletonInstalledFiles(id);
    const editable = getEditableSkeletonFiles(id);
    const productSlots = getSkeletonProductSlotFiles(id);
    const prompt = buildSkeletonPromptBlock(id);

    expect(installed.length).toBeGreaterThan(0);
    expect(editable.length).toBeGreaterThan(0);
    expect([...productSlots].sort(), `${id}: legacy product slots drifted from canonical agentEditable`)
      .toEqual([...policy.fileContract.agentEditable].sort());

    for (const path of policy.fileContract.requiredProductSlots) {
      expect(editable, `${id}: required slot missing from legacy editable bridge: ${path}`).toContain(path);
      expect(prompt, `${id}: coder prompt missing canonical required slot: ${path}`).toContain(path);
    }

    for (const path of policy.fileContract.optionalProductSlots) {
      expect(editable, `${id}: optional slot missing from legacy editable bridge: ${path}`).toContain(path);
      expect(prompt, `${id}: coder prompt should advertise optional editable slot: ${path}`).toContain(path);
    }

    for (const protectedPath of policy.fileContract.protectedFiles) {
      expect(prompt, `${id}: coder prompt missing protected contract: ${protectedPath}`).toContain(protectedPath);
    }
  });

  it('does not make optional routes mandatory in the canonical contract', () => {
    for (const id of ['saas-dashboard', 'social-community', 'productivity-tool', 'ecommerce'] as const) {
      const policy = getSkeletonRuntimePolicy(id);
      expect(policy.fileContract.optionalProductSlots).toContain('src/config/routes.ts');
      expect(policy.fileContract.requiredProductSlots).not.toContain('src/config/routes.ts');
    }
  });

  it('keeps mobile routes mandatory and editable', () => {
    const policy = getSkeletonRuntimePolicy('mobile-app');
    expect(policy.fileContract.requiredProductSlots).toContain('src/config/routes.ts');
    expect(policy.fileContract.agentEditable).toContain('src/config/routes.ts');
    expect(policy.fileContract.agentReadOnly).not.toContain('src/config/routes.ts');
  });
});
