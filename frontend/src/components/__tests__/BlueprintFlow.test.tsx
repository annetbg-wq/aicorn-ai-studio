// @vitest-environment jsdom
/**
 * BlueprintFlow.test.tsx — generation-plan → blueprint → confirm smoke test.
 *
 * Before first run install deps (not in frontend/package.json yet):
 *   npm i -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
 *
 * Then add to frontend/package.json scripts:
 *   "test:ui": "vitest run src/components/__tests__/BlueprintFlow.test.tsx"
 */

import React, { useReducer, useState, useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

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
vi.mock('lucide-react', () =>
  new Proxy({}, { get: () => () => null })
);

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

  // "Show Blueprint" — simulates onPlanReady firing from GenerationPipeline.
  const showBlueprint = () => {
    const bpId = 'bp-test-1';
    dispatch({
      type: 'APPEND',
      payload: normalizeMessage({
        id:               bpId,
        role:             'assistant',
        type:             'blueprint',
        blueprintVisible: true,
        blueprintText:    'Build a todo app with React.',
        appName:          'TodoApp',
        theme:            'dark',
        pages:            ['Home', 'Settings'],
        timestamp:        Date.now(),
        content:          '',
      }),
    });
    setPendingPlan({ id: 'plan-1' });
  };

  const confirmPlan = () => {
    // Mirrors useStudio ACCEPT_BLUEPRINT handler — hide then append
    dispatch({ type: 'SET_BLUEPRINT_VISIBLE', id: 'bp-test-1', visible: false });
    dispatch({ type: 'APPEND', payload: normalizeMessage({
      role: 'assistant', type: 'text', content: '⚙️ Building…', timestamp: Date.now(),
    }) });
    setPendingPlan(null);
  };

  const cancelPlan = () => {
    dispatch({ type: 'SET_BLUEPRINT_VISIBLE', id: 'bp-test-1', visible: false });
    setPendingPlan(null);
  };

  return (
    <>
      {/* Expose helpers to tests via data attrs on trigger buttons */}
      <button data-testid="trigger-blueprint" onClick={showBlueprint}>
        Show Blueprint
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
  });

  it('S1: BlueprintCard appears after Show Blueprint', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-blueprint'));

    // BlueprintCard renders the appName
    expect(screen.getByText('TodoApp')).toBeInTheDocument();
    expect(screen.getByText('Build it')).toBeInTheDocument();
  });

  it('S2: Clicking Build it does not trigger ChatErrorBoundary', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-blueprint'));
    await user.click(screen.getByText('Build it'));

    // ChatErrorBoundary renders the emoji 💬 only when crashed
    expect(screen.queryByText('💬')).not.toBeInTheDocument();
  });

  it('S3: No insertBefore / null-property error text in DOM after confirm', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-blueprint'));
    await user.click(screen.getByText('Build it'));

    const bodyText = document.body.innerText ?? document.body.textContent ?? '';
    expect(bodyText).not.toContain('insertBefore');
    expect(bodyText).not.toContain('Cannot read properties of null');
  });

  it('S4: BlueprintCard is hidden (not removed) after confirm', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-blueprint'));
    await user.click(screen.getByText('Build it'));

    // "Building…" message should appear (appended by confirmPlan)
    expect(screen.getByText('⚙️ Building…')).toBeInTheDocument();

    // "TodoApp" heading should NOT be visible (blueprintVisible=false → return null)
    expect(screen.queryByText('TodoApp')).not.toBeInTheDocument();
  });

  it('S5: Fast double-click on Build it dispatches SET_BLUEPRINT_VISIBLE exactly once', async () => {
    const dispatchSpy = vi.fn();
    render(<Harness onDispatch={dispatchSpy} />);

    await user.click(screen.getByTestId('trigger-blueprint'));

    // Double-click "Build it" as fast as possible
    const buildBtn = screen.getByText('Build it');
    await act(async () => {
      await user.dblClick(buildBtn);
    });

    const hideActions = dispatchSpy.mock.calls.filter(
      ([action]) => action.type === 'SET_BLUEPRINT_VISIBLE' && action.visible === false
    );

    // confirmPlan hides the blueprint once; second click finds no pendingPlan
    // and does not call confirmPlan again (button is gone after first click).
    expect(hideActions.length).toBe(1);
  });
});
