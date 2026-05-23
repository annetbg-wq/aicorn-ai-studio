// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
    RefreshCw: Icon,
    ThumbsUp: Icon,
    ThumbsDown: Icon,
  };
});

function renderPanel(messages: any[], overrides: Partial<React.ComponentProps<typeof LeftPanel>> = {}) {
  return render(
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
      onConfirmPlan={() => {}}
      appLanguage="en"
      {...overrides}
    />,
  );
}

describe('LeftPanel architect clarification card', () => {
  it('renders blocking clarifications as structured choices and does not auto-continue', () => {
    const onAnswerClarification = vi.fn();

    renderPanel([{
      id: 'clar-1',
      role: 'assistant',
      type: 'clarification',
      content: '',
      timestamp: Date.now(),
      blockingQuestions: [{
        id: 'blocking-tenant-scope',
        kind: 'blocking',
        capabilityIds: ['auth', 'backend'],
        question: 'For the first pass, how should accounts and data be scoped?',
        defaultChoiceId: 'single_user',
        impact: 'This choice changes the auth model, data schema, and access boundaries for the first pass.',
        options: [
          { id: 'single_user', label: 'Single-user account', description: 'Fastest first pass: each account only sees its own data.' },
          { id: 'team_workspace', label: 'Shared team workspace', description: 'A small team shares one workspace and works together inside it.' },
          { id: 'multi_tenant_org', label: 'Multi-tenant organizations', description: 'Separate organizations with invites and tenant-aware permissions from the start.' },
        ],
      }],
    }], {
      onAnswerClarification,
    });

    expect(screen.getByText('Pick the direction for the first pass:')).toBeInTheDocument();
    expect(screen.getByText('For the first pass, how should accounts and data be scoped?')).toBeInTheDocument();
    expect(screen.getByText('Fastest first pass')).toBeInTheDocument();
    expect(screen.queryByText('Пропустить')).not.toBeInTheDocument();
    expect(onAnswerClarification).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Shared team workspace'));
    fireEvent.click(screen.getByRole('button', { name: 'Use this choice and continue' }));

    expect(onAnswerClarification).toHaveBeenCalledTimes(1);
    expect(onAnswerClarification.mock.calls[0][0]).toContain('Shared team workspace');
  });
});
