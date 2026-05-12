// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../components/BenchmarkDashboard', () => ({
  BenchmarkDashboard: () => null,
}));

vi.mock('../../../services/ProtoPipeline', () => ({
  ProtoPipeline: {
    run: vi.fn(),
  },
}));

import { ConfigService } from '../../../services/ConfigService';
import { ProtoPipeline } from '../../../services/ProtoPipeline';
import {
  buildQualityRealTextSections,
  downloadQualityCompareSourceZip,
  runQualityCompareSuite,
} from '../QualityPanel';

function makePipelineResult(input: {
  buildId: string;
  appName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  homeSource: string;
}) {
  return {
    success: true,
    buildId: input.buildId,
    url: `/preview/${input.buildId}`,
    files: {
      'pages/Home.tsx': input.homeSource,
      'config/app.ts': `export const APP_NAME = '${input.appName}';`,
    },
    plan: {
      appName: input.appName,
      skeleton: 'mobile-app',
      summary: `${input.appName} summary`,
      rawResponse: JSON.stringify({ appName: input.appName, skeleton: 'mobile-app' }),
      fileTree: {
        'src/pages/Home.tsx': 'Main dashboard with habit progress and quick actions.',
        'src/config/app.ts': 'App metadata and storage keys.',
      },
      deltaFiles: [
        { path: 'pages/Home.tsx', purpose: 'Main dashboard with habit progress and quick actions.' },
        { path: 'config/app.ts', purpose: 'App metadata and storage keys.' },
      ],
      contextContract: 'useApp() owns onboarding and profile state.',
      dataModel: 'Habit: { id: string, name: string, completedDates: string[] }',
    },
    stepResults: {
      architect: {
        llm: {
          model: input.model,
          prompt_tokens: input.promptTokens,
          completion_tokens: 220,
          total_tokens: input.promptTokens + 220,
          cost_usd: input.costUsd / 3,
        },
      },
      coder: {
        llm: {
          model: input.model,
          prompt_tokens: 180,
          completion_tokens: input.completionTokens,
          total_tokens: 180 + input.completionTokens,
          cost_usd: input.costUsd * 2 / 3,
        },
      },
      build: {
        output: {
          file_count: 2,
          total_bytes: input.homeSource.length + 32,
          preview_url: `/preview/${input.buildId}`,
          files: ['pages/Home.tsx', 'config/app.ts'],
        },
      },
    },
    runTelemetry: {
      brief: 'Трекер привычек: ежедневные отметки, стрик, статистика',
      appName: input.appName,
      planSummary: `${input.appName} summary`,
      skeletonId: 'mobile-app',
      skeletonLabel: 'Mobile App',
      skeletonFiles: ['src/App.tsx', 'src/main.tsx', 'src/components/BottomTabs.tsx'],
      deltaFiles: ['pages/Home.tsx', 'config/app.ts'],
      designIntent: ['Mobile App', 'Theme Slate'],
      steps: [
        {
          id: 'architect',
          label: 'Проектирую архитектуру...',
          status: 'done',
          durationMs: 340,
          llm: {
            model: input.model,
            prompt_tokens: input.promptTokens,
            completion_tokens: 220,
            total_tokens: input.promptTokens + 220,
            cost_usd: input.costUsd / 3,
          },
        },
        {
          id: 'coder',
          label: 'Пишу код...',
          status: 'done',
          durationMs: 980,
          llm: {
            model: input.model,
            prompt_tokens: 180,
            completion_tokens: input.completionTokens,
            total_tokens: 180 + input.completionTokens,
            cost_usd: input.costUsd * 2 / 3,
          },
        },
      ],
      compileCount: 2,
      finalPreviewMounted: true,
      timeToSkeletonPreviewMs: 420,
      timeToFirstRealPreviewMs: 1600,
    },
  };
}

function makeWorkspaceSnapshot(suffix: string) {
  return {
    skeletonId: 'mobile-app',
    routeCount: 2,
    workspaceFiles: {
      'src/App.tsx': 'export default function App(){return null;}',
      'src/main.tsx': 'createRoot(document.getElementById("root")!).render(<App />)',
      'src/pages/Home.tsx': `export default function Home${suffix}(){return <div>${suffix}</div>;}`,
      'src/config/app.ts': `export const APP_NAME = 'HabitFlow ${suffix}';`,
    },
    deltaFiles: {
      'src/pages/Home.tsx': `export default function Home${suffix}(){return <div>${suffix}</div>;}`,
      'src/config/app.ts': `export const APP_NAME = 'HabitFlow ${suffix}';`,
    },
    outputTruth: {
      passed: true,
      blockers: [],
      structure: {
        richness: 'rich',
      },
      skeletonDelta: {
        skeletonFileCount: 2,
        deltaFileCount: 2,
        modifiedExistingCount: 0,
        newFileCount: 2,
        keyModifiedPaths: [],
        keyNewPaths: ['src/pages/Home.tsx', 'src/config/app.ts'],
      },
    },
  };
}

describe('QualityPanel flow-chain compare helpers', () => {
  beforeEach(() => {
    vi.spyOn(ConfigService, 'getKeyForAgent').mockReturnValue('native-key');
    vi.spyOn(ConfigService, 'getProviderKey').mockImplementation(((provider: string) => {
      if (provider === 'openrouter') return 'or-key';
      if (provider === 'deepseek') return 'native-key';
      return '';
    }) as typeof ConfigService.getProviderKey);
    vi.spyOn(ConfigService, 'getApiKey').mockReturnValue('or-key');

    vi.mocked(ProtoPipeline.run)
      .mockResolvedValueOnce(makePipelineResult({
        buildId: 'cmp-a',
        appName: 'HabitFlow A',
        model: 'deepseek/deepseek-chat',
        promptTokens: 420,
        completionTokens: 560,
        costUsd: 0.000215,
        homeSource: 'export default function HomeA(){return <div>A</div>;}',
      }) as never)
      .mockResolvedValueOnce(makePipelineResult({
        buildId: 'cmp-b',
        appName: 'HabitFlow B',
        model: 'anthropic/claude-sonnet-4-6',
        promptTokens: 510,
        completionTokens: 690,
        costUsd: 0.00235,
        homeSource: 'export default function HomeB(){return <div>B</div>;}',
      }) as never);

    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      value: vi.fn(() => 'blob:quality-compare'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      writable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('builds real-text sections for architect output', () => {
    const sections = buildQualityRealTextSections('architect-real', {
      appName: 'HabitFlow',
      skeleton: 'mobile-app',
      model: 'deepseek/deepseek-chat',
      fileCount: 5,
      prompt: 'Трекер привычек: ежедневные отметки, стрик, статистика',
      rawResponse: '{"appName":"HabitFlow"}',
      routeLabel: 'Standard API · deepseek',
      fileTree: {
        'src/pages/Home.tsx': 'Renders the main habit dashboard.',
      },
    });

    expect(sections.map(section => section.label)).toContain('Prompt');
    expect(sections.map(section => section.label)).toContain('Raw model response');
    expect(sections.some(section => section.content.includes('HabitFlow'))).toBe(true);
  });

  it('runs a full dual compare suite with route overrides, metrics, and full source truth', async () => {
    const workspaceA = vi.fn().mockResolvedValue(makeWorkspaceSnapshot('A'));
    const workspaceB = vi.fn().mockResolvedValue(makeWorkspaceSnapshot('B'));
    const testApiRunner = vi.fn(async (testId: string, buildId?: string) => ({
      status: 'pass' as const,
      duration_ms: testId === 'compile' ? 180 : testId === 'preview-http' ? 120 : 30,
      summary: `${testId} OK`,
      details: { testId, buildId: buildId ?? null },
    }));

    const left = await runQualityCompareSuite({
      profile: { route: 'standard-api', model: 'deepseek/deepseek-chat' },
      cliStatus: null,
      primaryProvider: 'deepseek',
      openRouterModels: [
        { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', pricing: { prompt: '0.00000014', completion: '0.00000028' } },
      ],
      pipelineRun: vi.mocked(ProtoPipeline.run),
      fetchWorkspaceSnapshot: workspaceA,
      testApiRunner,
    });

    const right = await runQualityCompareSuite({
      profile: { route: 'openrouter', model: 'anthropic/claude-sonnet-4-6' },
      cliStatus: null,
      primaryProvider: 'deepseek',
      openRouterModels: [
        { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', pricing: { prompt: '0.000003', completion: '0.000015' } },
      ],
      pipelineRun: vi.mocked(ProtoPipeline.run),
      fetchWorkspaceSnapshot: workspaceB,
      testApiRunner,
    });

    expect(ProtoPipeline.run).toHaveBeenCalledTimes(2);
    expect(vi.mocked(ProtoPipeline.run).mock.calls[0]?.[0]?.routeOverrides?.primary?.provider).toBe('deepseek');
    expect(vi.mocked(ProtoPipeline.run).mock.calls[1]?.[0]?.routeOverrides?.primary?.provider).toBe('openrouter');

    expect(left.suite?.tests['code-delta'].status).toBe('pass');
    expect(right.suite?.tests['compile'].status).toBe('pass');
    expect(left.suite?.metrics.prompt_tokens).toBe(600);
    expect(right.suite?.metrics.completion_tokens).toBe(910);
    expect(left.suite?.metrics.cost_usd).toBeCloseTo(0.000215, 6);
    expect(right.suite?.metrics.cost_usd).toBeCloseTo(0.00235, 6);

    expect(left.suite?.sourceFiles.map(file => file.origin)).toContain('skeleton');
    expect(left.suite?.sourceFiles.map(file => file.origin)).toContain('delta');
    expect(right.suite?.codeSections.map(section => section.label)).toContain('src/pages/Home.tsx');
    expect(left.realText.some(section => section.label === 'Raw model response')).toBe(true);

    expect(testApiRunner).toHaveBeenCalledWith('compile', 'cmp-a');
    expect(testApiRunner).toHaveBeenCalledWith('compile', 'cmp-b');
    expect(testApiRunner).toHaveBeenCalledWith('save-ready', 'cmp-a');
    expect(testApiRunner).toHaveBeenCalledWith('save-ready', 'cmp-b');
  });

  it('downloads the full source package for audit with skeleton and delta files', async () => {
    await downloadQualityCompareSourceZip([
      { path: 'src/App.tsx', content: 'export default function App(){return null;}' },
      { path: 'src/pages/Home.tsx', content: 'export default function Home(){return <div>A</div>;}' },
    ], 'quality-compare-full-source.zip');

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });
});
