// @vitest-environment jsdom
/**
 * BlueprintFlow.test.tsx — generation-plan confirm flow smoke test.
 *
 * Before first run install deps (not in frontend/package.json yet):
 *   npm i -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
 *
 * Then add to frontend/package.json scripts:
 *   "test:ui": "vitest run src/components/__tests__/BlueprintFlow.test.tsx"
 */

import React, { useReducer, useState, useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { chatReducer, normalizeMessage } from '../../types/chat';
import type { ChatMessage } from '../../types/chat';
import { LeftPanel } from '../LeftPanel';
import { ChatErrorBoundary } from '../boundaries/ChatErrorBoundary';

// ── Module mocks ────────────────────────────────────────────────────────────

// react-markdown is ESM-only and breaks jsdom; stub it out.
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));
vi.mock('remark-gfm', () => ({ default: () => {} }));

// lucide-react icons — just render nothing in tests.
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

// ── Minimal LeftPanel prop factory ──────────────────────────────────────────

function makeScrollRef() {
  return { current: document.createElement('div') };
}

interface WrapperState {
  messages: ChatMessage[];
  pendingPlan: object | null;
}

/**
 * Harness that owns the chatReducer state and exposes a spy-able dispatch.
 * Passes the result down to LeftPanel as plain props.
 */
function Harness({
  initialMessages = [],
  onDispatch,
}: {
  initialMessages?: ChatMessage[];
  onDispatch?: (action: any) => void;
}) {
  const [messages, rawDispatch] = useReducer(chatReducer, initialMessages);
  const [pendingPlan, setPendingPlan] = useState<object | null>(null);
  const scrollRef = makeScrollRef();

  const dispatch = (action: any) => {
    onDispatch?.(action);
    rawDispatch(action);
  };

  // "Show Plan" — simulates a generation-plan message in chat.
  const showBlueprint = () => {
    const planMsgId = 'plan-msg-1';
    dispatch({
      type: 'APPEND',
      payload: normalizeMessage({
        id:               planMsgId,
        role:             'assistant',
        type:             'generation-plan',
        content:          '',
        appName:          'TodoApp',
        summary:          'Собираем TODO приложение.',
        screens:          [{ name: 'Page1', description: { type: 'counter', label: 'Счетчик задач' } }],
        pages:            ['Home', 'Settings'],
        steps:            [{ id: 's1', label: 'Планирование', status: 'active' }],
        progress:         0,
        buildStatus:      'draft',
        timestamp:        Date.now(),
      }),
    });
    setPendingPlan({ id: 'plan-1' });
  };

  const confirmPlan = () => {
    dispatch({ type: 'REMOVE_BY_TYPE', msgType: 'generation-plan' });
    dispatch({ type: 'APPEND', payload: normalizeMessage({
      role: 'assistant', type: 'text', content: '⚙️ Building…', timestamp: Date.now(),
    }) });
    setPendingPlan(null);
  };

  const cancelPlan = () => {
    dispatch({ type: 'REMOVE_BY_TYPE', msgType: 'generation-plan' });
    setPendingPlan(null);
  };

  return (
    <>
      {/* Expose helpers to tests via data attrs on trigger buttons */}
      <button data-testid="trigger-plan" onClick={showBlueprint}>
        Show Plan
      </button>

      <ChatErrorBoundary>
        <LeftPanel
          messages={messages}
          input=""
          setInput={() => {}}
          onSend={() => {}}
          onStop={() => {}}
          isGenerating={false}
          progress={0}
          currentPhase="idle"
          scrollRef={scrollRef as any}
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
          pendingPlan={pendingPlan}
          confirmPlan={confirmPlan}
          cancelPlan={cancelPlan}
        />
      </ChatErrorBoundary>
    </>
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('BlueprintFlow — generation-plan → blueprint → confirm', () => {
  const user = userEvent.setup();

  // Suppress React error boundary console.error noise in test output
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    cleanup();
  });

  it('S1: GenerationPlanCard appears after Show Plan', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-plan'));

    // GenerationPlanCard renders app name, summary and confirm button.
    expect(screen.getByText(/TodoApp/)).toBeInTheDocument();
    expect(screen.getByText('Собираем TODO приложение.')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-plan-btn')).toBeInTheDocument();
  });

  it('S2: Clicking confirm does not trigger ChatErrorBoundary', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-plan'));
    await user.click(screen.getByTestId('confirm-plan-btn'));

    // ChatErrorBoundary renders the emoji 💬 only when crashed
    expect(screen.queryByText('💬')).not.toBeInTheDocument();
  });

  it('S3: No insertBefore / null-property error text in DOM after confirm', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-plan'));
    await user.click(screen.getByTestId('confirm-plan-btn'));

    const bodyText = document.body.innerText ?? document.body.textContent ?? '';
    expect(bodyText).not.toContain('insertBefore');
    expect(bodyText).not.toContain('Cannot read properties of null');
  });

  it('S4: Plan card is hidden after confirm', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-plan'));
    await user.click(screen.getByTestId('confirm-plan-btn'));

    // "Building…" message should appear (appended by confirmPlan)
    expect(screen.getByText('⚙️ Building…')).toBeInTheDocument();

    // Plan card should no longer be visible after confirm in this harness.
    expect(screen.queryByText('TodoApp')).not.toBeInTheDocument();
  });

  it('S5: Fast double-click on confirm dispatches REMOVE_BY_TYPE exactly once', async () => {
    const dispatchSpy = vi.fn();
    render(<Harness onDispatch={dispatchSpy} />);

    await user.click(screen.getByTestId('trigger-plan'));

    // Double-click confirm as fast as possible
    const buildBtn = screen.getByTestId('confirm-plan-btn');
    await act(async () => {
      await user.dblClick(buildBtn);
    });

    const hideActions = dispatchSpy.mock.calls.filter(
      ([action]) => action.type === 'REMOVE_BY_TYPE' && action.msgType === 'generation-plan'
    );

    // confirmPlan removes generation-plan once; second click should not add another removal.
    expect(hideActions.length).toBe(1);
  });
});
