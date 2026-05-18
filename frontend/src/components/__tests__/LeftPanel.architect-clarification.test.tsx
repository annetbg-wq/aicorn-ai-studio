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
        question: 'How should account data be scoped in the first pass?',
        defaultChoiceId: 'single_user',
        impact: 'This changes the auth model, data schema, and access boundaries.',
        options: [
          { id: 'single_user', label: 'Single user account', description: 'Fastest path: each account owns only its own data.' },
          { id: 'team_workspace', label: 'Shared team workspace', description: 'Several members work inside one shared workspace.' },
          { id: 'multi_tenant_org', label: 'Full multi-tenant organizations', description: 'Separate organizations, invite flows, and tenant-aware permissions.' },
        ],
      }],
    }], {
      onAnswerClarification,
    });

    expect(screen.getByText('Decision required before build continues:')).toBeInTheDocument();
    expect(screen.getByText('How should account data be scoped in the first pass?')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.queryByText('Пропустить')).not.toBeInTheDocument();
    expect(onAnswerClarification).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Shared team workspace'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply choice and continue' }));

    expect(onAnswerClarification).toHaveBeenCalledTimes(1);
    expect(onAnswerClarification.mock.calls[0][0]).toContain('Shared team workspace');
  });
});
