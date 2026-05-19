// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { runLiveReadinessPreflight } from '../LiveReadinessPreflight';

const QUALITY_CONTROLS = {
  hasRunPreflightButton: true,
  isolatedFromRunAll: true,
  clearsPreflightState: true,
  reportIncludesPreflight: true,
} as const;

describe('LiveReadinessPreflight UI primitive contract', () => {
  it('passes the UI primitive catalog check when canonical workspace paths are normalized', async () => {
    const result = await runLiveReadinessPreflight({
      qualityControls: QUALITY_CONTROLS,
      checkIds: ['ui-primitive-catalog'],
    });

    expect(result.status).toBe('pass');
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatchObject({
      id: 'ui-primitive-catalog',
      status: 'pass',
    });
  });

  it('does not report alert-dialog, avatar, or sheet as missing in prompt catalog truthfulness', async () => {
    const result = await runLiveReadinessPreflight({
      qualityControls: QUALITY_CONTROLS,
      checkIds: ['prompt-catalog-truthfulness'],
    });

    const diagnostics = result.checks[0]?.diagnostics ?? [];
    const blockedImports = diagnostics
      .map(diagnostic => diagnostic.import_path)
      .filter((importPath): importPath is string => Boolean(importPath));

    expect(blockedImports).not.toContain('@/components/ui/alert-dialog');
    expect(blockedImports).not.toContain('@/components/ui/avatar');
    expect(blockedImports).not.toContain('@/components/ui/sheet');
  });

  it('passes prompt catalog truthfulness when landing-page provided components match physical section surfaces', async () => {
    const result = await runLiveReadinessPreflight({
      qualityControls: QUALITY_CONTROLS,
      checkIds: ['prompt-catalog-truthfulness'],
    });

    expect(result.status).toBe('pass');
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatchObject({
      id: 'prompt-catalog-truthfulness',
      status: 'pass',
    });
  });

  it('passes shared hook contracts when canonical hooks and manifest-required data files are present', async () => {
    const result = await runLiveReadinessPreflight({
      qualityControls: QUALITY_CONTROLS,
      checkIds: ['shared-hook-contracts'],
    });

    expect(result.status).toBe('pass');
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatchObject({
      id: 'shared-hook-contracts',
      status: 'pass',
    });
  });
});