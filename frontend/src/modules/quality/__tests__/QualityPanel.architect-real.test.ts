// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigService } from '../../../services/ConfigService';
import { Orchestrator } from '../../../services/Orchestrator';
import {
  extractArchitectCompletionMeta,
  runArchitectRealTest,
} from '../QualityPanel';

describe('Architect Real helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts assistant text from anthropic-style responses', () => {
    const meta = extractArchitectCompletionMeta({
      model: 'claude-test',
      stop_reason: 'end_turn',
      usage: { input_tokens: 123, output_tokens: 45 },
      content: [
        { type: 'text', text: '{"appName":"HabitFlow"}' },
      ],
    }, 'fallback-model');

    expect(meta.content).toContain('HabitFlow');
    expect(meta.llmModel).toBe('claude-test');
    expect(meta.finishReason).toBe('end_turn');
    expect(meta.usageRaw?.input_tokens).toBe(123);
  });

  it('retries architect generation when the first response is truncated JSON', async () => {
    vi.spyOn(ConfigService, 'resolveModel').mockReturnValue('deepseek/deepseek-chat');
    vi.spyOn(ConfigService, 'getKeyForAgent').mockReturnValue('test-key');
    vi.spyOn(ConfigService, 'getAgentConfig').mockReturnValue({ provider: 'openrouter' } as never);
    vi.spyOn(Orchestrator, 'getEndpoint').mockReturnValue('https://openrouter.ai/api/v1/chat/completions');
    vi.spyOn(Orchestrator, 'normalizeModelId').mockReturnValue('deepseek/deepseek-chat');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        model: 'deepseek/deepseek-chat',
        usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
        choices: [{
          finish_reason: 'length',
          message: {
            content: '{ "appName": "HabitTracker", "skeleton": "mobile-app", "fileTree": { "src/types/habit.ts": "Defines the Habit type with id, name, createdAt, and completions map, used for state management.", ',
          },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        model: 'deepseek/deepseek-chat',
        usage: { prompt_tokens: 180, completion_tokens: 220, total_tokens: 400 },
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              appName: 'HabitTracker',
              skeleton: 'mobile-app',
              fileTree: {
                'src/config/app.ts': 'Defines app metadata and storage keys used by onboarding and habit persistence.',
                'src/config/navigation.ts': 'Declares bottom-tab navigation items and route labels used by the shell.',
                'src/data/types.ts': 'Defines Habit, HabitCompletion, and ProgressSummary entities used by screens and hooks.',
                'src/data/seed.ts': 'Provides starter habits and seeded completion history used on first launch.',
                'src/pages/Home.tsx': 'Renders the main habit dashboard with completion actions and summary cards using Habit data.',
                'src/pages/Progress.tsx': 'Shows weekly streak analytics and completion trends using ProgressSummary data.',
              },
              contextContract: 'useApp() owns onboarding and profile state; product files consume it without direct localStorage writes.',
              dataModel: 'Habit: { id: string, name: string, createdAt: string, completions: Record<string, boolean> }',
            }),
          },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    vi.stubGlobal('fetch', fetchMock);

    const result = await runArchitectRealTest();

    expect(result.status).toBe('pass');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.summary).toContain('реальный LLM output');
  });

  it('supports explicit Claude CLI compare runs via quality proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'claude-sonnet-4-6',
      output_text: JSON.stringify({
        appName: 'HabitTracker',
        skeleton: 'mobile-app',
        fileTree: {
          'src/config/app.ts': 'Defines app metadata and storage keys used by onboarding and habit persistence.',
          'src/config/navigation.ts': 'Declares tab routes and labels used by the mobile shell.',
          'src/data/types.ts': 'Defines Habit, HabitEntry, and StreakSummary entities used by screens and hooks.',
          'src/data/seed.ts': 'Provides starter habits and seeded completion history for first launch.',
          'src/pages/Home.tsx': 'Renders the main habit dashboard with today actions and streak summary data.',
          'src/pages/Progress.tsx': 'Shows streak analytics and completion trends using HabitEntry summaries.',
        },
        contextContract: 'useApp() owns onboarding and profile state; feature files consume it without direct storage writes.',
        dataModel: 'Habit: { id: string, name: string, createdAt: string, completions: Record<string, boolean> }',
      }),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    vi.stubGlobal('fetch', fetchMock);

    const result = await runArchitectRealTest({ route: 'claude-cli', model: 'claude-sonnet-4-6' });

    expect(result.status).toBe('pass');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/quality/llm-run',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});
