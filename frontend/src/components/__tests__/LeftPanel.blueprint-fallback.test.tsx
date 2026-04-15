// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { LeftPanel } from '../LeftPanel';

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));
vi.mock('remark-gfm', () => ({ default: () => {} }));

vi.mock('lucide-react', () => {
  const Icon = () => null;
  return {
    Plus: Icon,
    Link2: Icon,
    Camera: Icon,
    Sparkles: Icon,
    Paperclip: Icon,
    History: Icon,
    X: Icon,
    Clock: Icon,
    RotateCcw: Icon,
    GitBranch: Icon,
    Undo2: Icon,
    Redo2: Icon,
    Square: Icon,
    Copy: Icon,
  };
});

describe('LeftPanel blueprint fallback', () => {
  test('blueprint without blueprintText renders fallback card with Build it button', async () => {
    const onConfirmPlan = vi.fn();
    const messages = [{
      id: '1',
      role: 'system',
      type: 'blueprint',
      content: 'Plan ready',
      timestamp: Date.now(),
    }];

    render(
      <LeftPanel
        messages={messages as any}
        input=""
        setInput={() => {}}
        onSend={() => {}}
        onStop={() => {}}
        isGenerating={false}
        progress={0}
        currentPhase="idle"
        scrollRef={{ current: document.createElement('div') } as React.RefObject<HTMLDivElement>}
        projects={[]}
        currentProjectId={null}
        onNewProject={() => {}}
        onLoadProject={() => {}}
        onDeleteProject={() => {}}
        onSettings={() => {}}
        setTheme={() => {}}
        currentTheme="dark"
        snapshots={[]}
        currentSnapshotId={null}
        currentVersion={0}
        onRestoreSnapshot={() => {}}
        canUndo={false}
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
        fullContextMode={false}
        setFullContextMode={() => {}}
        activeFile=""
        sessionCost={0}
        sessionTokens={0}
        projectCost={0}
        selectedModel="gpt-4o"
        pendingPlan={null}
        confirmPlan={() => {}}
        cancelPlan={() => {}}
        onConfirmPlan={onConfirmPlan}
      />
    );

    const card = await screen.findByTestId('generation-plan-card');
    expect(card).toBeInTheDocument();

    const btn = await screen.findByTestId('confirm-plan-btn');
    expect(btn).toBeInTheDocument();

    await userEvent.click(btn);
    expect(onConfirmPlan).toHaveBeenCalledTimes(1);
  });
});

