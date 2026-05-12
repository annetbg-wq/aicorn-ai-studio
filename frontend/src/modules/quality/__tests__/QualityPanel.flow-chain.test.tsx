// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { ConfigService } from '../../../services/ConfigService';
import { QualityPanel, buildQualityRealTextSections } from '../QualityPanel';

vi.mock('../../../components/BenchmarkDashboard', () => ({
  BenchmarkDashboard: () => <div>Benchmark mock</div>,
}));

describe('QualityPanel flow-chain compare UX', () => {
  beforeEach(() => {
    vi.spyOn(ConfigService, 'resolveModel').mockReturnValue('deepseek/deepseek-chat');
    vi.spyOn(ConfigService, 'getKeyForAgent').mockReturnValue('native-key');
    vi.spyOn(ConfigService, 'getProviderKey').mockImplementation(((provider: string) => {
      if (provider === 'openrouter') return 'or-key';
      if (provider === 'deepseek') return 'native-key';
      return '';
    }) as typeof ConfigService.getProviderKey);
    vi.spyOn(ConfigService, 'getApiKey').mockReturnValue('or-key');
    vi.spyOn(ConfigService, 'getAgentConfig').mockReturnValue({ provider: 'deepseek', modelId: 'deepseek/deepseek-chat' } as never);

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/token')) {
        return Promise.resolve(new Response(JSON.stringify({
          claude: { available: true, version: '1.0.0' },
          codex: { available: true, version: '1.0.0' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        status: 'pass',
        duration_ms: 12,
        summary: 'HTTP 200',
        details: {
          httpStatus: 200,
          response: { status: 'ok', provider: 'deepseek' },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }));
  });

  afterEach(() => {
    cleanup();
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

  it('keeps compare controls hidden until the extra button is enabled', async () => {
    const user = userEvent.setup();
    render(<QualityPanel selectedModel="deepseek/deepseek-chat" />);

    expect(screen.queryByText('LLM compare')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Compare models/i }));

    expect(await screen.findByText('LLM compare')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('deepseek/deepseek-chat').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Compare' }).length).toBeGreaterThan(0);
  });

  it('shows an honest compare-unavailable note for runtime-only checks', async () => {
    const user = userEvent.setup();
    render(<QualityPanel selectedModel="deepseek/deepseek-chat" />);

    await user.click(screen.getAllByRole('button', { name: /Compare models/i })[0]);
    await screen.findByText('LLM compare');

    const compareButtons = screen.getAllByRole('button', { name: 'Compare' });
    await user.click(compareButtons[0]);

    expect(await screen.findByText('Compare unavailable for this item')).toBeInTheDocument();
    expect(screen.getByText(/Runtime-backed checks validate the built app/i)).toBeInTheDocument();
  });
});
