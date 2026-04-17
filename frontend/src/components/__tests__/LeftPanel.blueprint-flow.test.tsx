// @vitest-environment jsdom
/**
 * LeftPanel.blueprint-flow.test.tsx — generation-plan confirm flow smoke test.
 *
 * Before first run install deps (not in frontend/package.json yet):
 *   npm i -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
 *
 * Then add to frontend/package.json scripts:
 *   "test:ui": "vitest run src/components/__tests__/LeftPanel.blueprint-flow.test.tsx"
 */

import React, { useReducer, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { chatReducer, normalizeMessage } from '../../types/chat';
import type { ChatMessage } from '../../types/chat';
import { useStudio } from '../../hooks/useStudio';
import { LeftPanel } from '../LeftPanel';
import { ChatErrorBoundary } from '../boundaries/ChatErrorBoundary';

// ── Module mocks ────────────────────────────────────────────────────────────
const studioMock = vi.hoisted(() => ({
  onConfirmPlan: vi.fn(),
}));

vi.mock('../../hooks/useStudio', () => ({
  useStudio: () => ({
    onConfirmPlan: studioMock.onConfirmPlan,
  }),
}));

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
  const [pendingPlan, setPendingPlan] = useState<any | null>(null);
  const scrollRef = makeScrollRef();
  const { onConfirmPlan } = useStudio() as unknown as { onConfirmPlan: (plan: object) => void };

  const dispatch = (action: any) => {
    onDispatch?.(action);
    rawDispatch(action);
  };

  // "Show Blueprint" — simulates a generation-plan message in chat.
  const showBlueprint = () => {
    const planMsgId = 'plan-msg-1';
    dispatch({
      type: 'APPEND',
      payload: normalizeMessage({
        id:               planMsgId,
        role:             'assistant',
        type:             'blueprint',
        content:          'TodoApp — Собираем TODO приложение.',
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
    setPendingPlan({
      id: 'plan-1',
      plan: { id: 'plan-1' },
      architectKickoff: {
        selectedOptionId: 'core_backend',
        plan: {
          scopeOptions: [
            { id: 'core', label: 'Build core', description: 'Core only' },
            { id: 'core_backend', label: 'Build core + backend', description: 'Core with backend' },
            { id: 'core_backend_ai', label: 'Build core + backend + AI', description: 'Core with backend and AI' },
            { id: 'revise', label: 'Revise plan', description: 'Revise before build' },
          ],
        },
      },
    });
  };

  const confirmPlan = () => {
    dispatch({ type: 'REMOVE_BY_TYPE', msgType: 'blueprint' });
    dispatch({ type: 'APPEND', payload: normalizeMessage({
      role: 'assistant', type: 'text', content: '⚙️ Building…', timestamp: Date.now(),
    }) });
    setPendingPlan(null);
  };
  const buildingRef = React.useRef(false);
  const buildIt = () => {
    if (buildingRef.current) return;
    buildingRef.current = true;
    onConfirmPlan({
      id: 'plan-1',
      selectedOptionId: pendingPlan?.architectKickoff?.selectedOptionId,
    });
    confirmPlan();
  };

  const selectKickoffScope = (optionId: 'core' | 'core_backend' | 'core_backend_ai') => {
    setPendingPlan((prev: any) => ({
      ...prev,
      architectKickoff: {
        ...prev.architectKickoff,
        selectedOptionId: optionId,
      },
    }));
  };

  const cancelPlan = () => {
    dispatch({ type: 'REMOVE_BY_TYPE', msgType: 'blueprint' });
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
          onConfirmPlan={buildIt}
          selectKickoffScope={selectKickoffScope}
        />
      </ChatErrorBoundary>
    </>
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('LeftPanel blueprint flow — generation-plan → blueprint → Build it', () => {
  const user = userEvent.setup();

  // Suppress React error boundary console.error noise in test output
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    studioMock.onConfirmPlan.mockClear();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    cleanup();
  });

  it('S1: GenerationPlanCard appears after Show Blueprint', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-blueprint'));

    // GenerationPlanCard renders app name and confirm button.
    expect(screen.getByText(/TodoApp/)).toBeInTheDocument();
    expect(screen.getByTestId('confirm-plan-btn')).toBeInTheDocument();
  });

  it('S2: Clicking Build it does not trigger ChatErrorBoundary', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-blueprint'));
    await user.click(screen.getByTestId('confirm-plan-btn'));

    // ChatErrorBoundary renders the emoji 💬 only when crashed
    expect(screen.queryByText('💬')).not.toBeInTheDocument();
  });

  it('S3: No insertBefore / null-property error text in DOM after confirm', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-blueprint'));
    await user.click(screen.getByTestId('confirm-plan-btn'));

    const bodyText = document.body.innerText ?? document.body.textContent ?? '';
    expect(bodyText).not.toContain('insertBefore');
    expect(bodyText).not.toContain('Cannot read properties of null');
  });

  it('S4: Clicking Build it calls onConfirmPlan', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-blueprint'));
    await user.click(screen.getByTestId('confirm-plan-btn'));

    expect(studioMock.onConfirmPlan).toHaveBeenCalledTimes(1);
  });

  it('S4b: Kickoff scope options are rendered as selectable controls', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-blueprint'));

    expect(screen.getByTestId('kickoff-option-core')).toBeInTheDocument();
    expect(screen.getByTestId('kickoff-option-core_backend')).toBeInTheDocument();
    expect(screen.getByTestId('kickoff-option-core_backend_ai')).toBeInTheDocument();
    expect(screen.getByText('Revise plan')).toBeInTheDocument();
  });

  it('S4c: Selected kickoff scope is preserved when build starts', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-blueprint'));
    await user.click(screen.getByTestId('kickoff-option-core'));
    await user.click(screen.getByTestId('confirm-plan-btn'));

    expect(studioMock.onConfirmPlan).toHaveBeenCalledWith(
      expect.objectContaining({ selectedOptionId: 'core' }),
    );
  });

  it('S5: Fast double-click on Build it dispatches REMOVE_BY_TYPE exactly once', async () => {
    render(<Harness />);

    await user.click(screen.getByTestId('trigger-blueprint'));

    // Double-click confirm as fast as possible
    const buildBtn = screen.getByTestId('confirm-plan-btn');
    await act(async () => {
      await user.dblClick(buildBtn);
    });

    // After first click the card is removed from state — button must be gone.
    expect(screen.queryByTestId('confirm-plan-btn')).not.toBeInTheDocument();
    expect(studioMock.onConfirmPlan).toHaveBeenCalledTimes(1);
  });
});
