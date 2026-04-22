// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, test, vi } from 'vitest';

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

afterEach(() => {
  cleanup();
});

function renderPanel(messages: any[]) {
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
    />,
  );
}

describe('LeftPanel generation trust UX', () => {
  test('shows fast prototype trust without adding extra friction to fallback blueprint cards', () => {
    renderPanel([{
      id: 'bp-fast',
      role: 'assistant',
      type: 'blueprint',
      content: 'Plan ready',
      timestamp: Date.now(),
      generationTrust: {
        mode: 'fast_prototype',
        modeLabel: 'Fast prototype mode',
        trustBasis: 'branch_memory_observation',
        trustLabel: 'Using observed branch state',
        summary: 'Fast prototype mode is active. Branch architecture stays lightweight and only helps with compatibility.',
        conflictHandling: 'none',
        conflictLabel: null,
        conflictSummary: null,
        indicators: [{
          id: 'fast_prototype_mode',
          label: 'Fast prototype mode',
          state: 'planned',
        }],
      },
    }]);

    expect(screen.getByTestId('generation-plan-card')).toBeInTheDocument();
    expect(screen.getByText('Fast prototype mode')).toBeInTheDocument();
    expect(screen.getByText('Using observed branch state')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-plan-btn')).toBeInTheDocument();
  });

  test('shows accepted architecture and deferred exclusion in generation reports', () => {
    renderPanel([{
      id: 'report-accepted',
      role: 'assistant',
      type: 'generation-report',
      content: 'Built your app!',
      timestamp: Date.now(),
      generationTrust: {
        mode: 'architect_guided',
        modeLabel: 'Architect-guided mode',
        trustBasis: 'accepted_branch_architecture',
        trustLabel: 'Using accepted branch architecture',
        summary: 'Accepted branch architecture is actively guiding this build.',
        conflictHandling: 'none',
        conflictLabel: null,
        conflictSummary: null,
        indicators: [{
          id: 'deferred_scope_excluded',
          label: 'Deferred items excluded from scope',
          state: 'deferred',
        }],
      },
      branchReality: {
        sectionTitle: 'Branch reality',
        stateLabel: 'Aligned',
        summary: 'Branch reality is aligned. 2 tracked items match the current branch.',
        alignedLabel: 'Aligned',
        alignedItems: [{ id: 'aligned-login', title: 'Login', summary: 'Planned route is live at /login.' }],
        alignedEmpty: 'Nothing is confirmed as aligned yet.',
        missingLabel: 'Missing',
        missingItems: [],
        missingEmpty: 'No planned gaps are visible right now.',
        driftingLabel: 'Drifting',
        driftingItems: [],
        driftingEmpty: 'No drift signals are visible right now.',
        nextPassLabel: 'Next pass',
        nextPassTitle: 'Ship analytics dashboard',
        nextPassSummary: 'Continue the active implementation step "Ship analytics dashboard".',
      },
      report: {
        mode: 'NEW',
        theme: 'default',
        filesCreated: ['src/App.tsx'],
        filesModified: [],
        pageCount: 1,
        duration: 8,
      },
    }]);

    expect(screen.getByText('Architect-guided mode')).toBeInTheDocument();
    expect(screen.getByText('Using accepted branch architecture')).toBeInTheDocument();
    expect(screen.getByText('Deferred items excluded from scope')).toBeInTheDocument();
    expect(screen.getByTestId('generation-branch-reality')).toHaveTextContent('Branch reality');
    expect(screen.getByTestId('generation-branch-reality')).toHaveTextContent('Aligned');
  });

  test('shows proposed guidance and localized conflict summaries when conflicts are active', () => {
    renderPanel([{
      id: 'report-conflict',
      role: 'assistant',
      type: 'generation-report',
      content: 'Aplicación lista',
      timestamp: Date.now(),
      generationTrust: {
        mode: 'proposed_experiment',
        modeLabel: 'Modo de experimento propuesto',
        trustBasis: 'proposed_draft_guidance',
        trustLabel: 'Usando guía propuesta del borrador',
        summary: 'La guía propuesta del borrador está activa en esta ejecución y sigue siendo exploratoria hasta que se acepte.',
        conflictHandling: 'proposed_experiment',
        conflictLabel: 'Experimento propuesto',
        conflictSummary: 'Conflicto con la arquitectura aceptada de la rama: Use Supabase auth. Esta ejecución se trata como un experimento propuesto.',
        indicators: [{
          id: 'proposed_draft_guidance',
          label: 'Usando guía propuesta del borrador',
          state: 'open',
        }],
      },
      report: {
        mode: 'EDIT',
        theme: 'default',
        filesCreated: [],
        filesModified: ['src/auth.ts'],
        pageCount: 0,
        duration: 5,
      },
    }]);

    expect(screen.getByText('Modo de experimento propuesto')).toBeInTheDocument();
    expect(screen.getByText('Usando guía propuesta del borrador')).toBeInTheDocument();
    expect(screen.getByText('Experimento propuesto')).toBeInTheDocument();
    expect(screen.getByTestId('generation-trust-conflict')).toHaveTextContent('Conflicto con la arquitectura aceptada de la rama');
  });

  test('renders localized branch reality summaries in generation reports', () => {
    renderPanel([{
      id: 'report-reality-es',
      role: 'assistant',
      type: 'generation-report',
      content: 'Aplicación lista',
      timestamp: Date.now(),
      branchReality: {
        sectionTitle: 'Realidad de la rama',
        stateLabel: 'Desviado',
        summary: 'La realidad de la rama se desvió. Faltan 1 elementos planificados y 2 señales de deriva necesitan revisión.',
        alignedLabel: 'Alineado',
        alignedItems: [{ id: 'aligned-login', title: 'Login', summary: 'La ruta planificada ya está activa en /login.' }],
        alignedEmpty: 'Todavía no hay elementos confirmados como alineados.',
        missingLabel: 'Falta',
        missingItems: [{ id: 'missing-dashboard', title: 'Dashboard', summary: 'La ruta planificada aún falta en /dashboard.' }],
        missingEmpty: 'Ahora mismo no se ven brechas planificadas.',
        driftingLabel: 'Deriva',
        driftingItems: [{ id: 'drift-settings', title: 'Settings', summary: 'La ruta implementada /settings no está seguida en la memoria de la rama.' }],
        driftingEmpty: 'Ahora mismo no se ven señales de deriva.',
        nextPassLabel: 'Siguiente pasada',
        nextPassTitle: 'Settings',
        nextPassSummary: 'Reconcilia la deriva alrededor de "Settings" antes de ampliar el alcance.',
      },
      report: {
        mode: 'EDIT',
        theme: 'default',
        filesCreated: [],
        filesModified: ['src/App.tsx'],
        pageCount: 0,
        duration: 5,
      },
    }]);

    expect(screen.getByTestId('generation-branch-reality')).toHaveTextContent('Realidad de la rama');
    expect(screen.getByTestId('generation-branch-reality')).toHaveTextContent('Desviado');
    expect(screen.getByTestId('generation-branch-reality')).toHaveTextContent('Siguiente pasada');
  });

  test('shows visual quality verdict and reasons in generation reports while preserving the trust banner', () => {
    renderPanel([{
      id: 'report-visual-quality',
      role: 'assistant',
      type: 'generation-report',
      content: 'Built your app!',
      timestamp: Date.now(),
      generationTrust: {
        mode: 'architect_guided',
        modeLabel: 'Architect-guided mode',
        trustBasis: 'accepted_branch_architecture',
        trustLabel: 'Using accepted branch architecture',
        summary: 'Accepted branch architecture is actively guiding this build.',
        conflictHandling: 'none',
        conflictLabel: null,
        conflictSummary: null,
        indicators: [],
      },
      report: {
        mode: 'NEW',
        theme: 'default',
        filesCreated: ['src/App.tsx'],
        filesModified: [],
        pageCount: 1,
        duration: 8,
        visualPolish: {
          mode: 'fast_prototype',
          outcome: 'applied',
          attempts: 1,
          maxPasses: 1,
          triggerReasons: ['weak hierarchy'],
        },
        visualQuality: {
          verdict: 'weak',
          band: 'low',
          score: 44,
          reasons: [],
          dimensions: [
            { id: 'visual-hierarchy', verdict: 'weak', score: 30, reasons: ['weak'] },
            { id: 'clutter-breathing-room', verdict: 'weak', score: 38, reasons: ['weak'] },
            { id: 'spacing-consistency', verdict: 'weak', score: 42, reasons: ['weak'] },
            { id: 'cta-prominence', verdict: 'acceptable', score: 62, reasons: ['ok'] },
            { id: 'state-completeness', verdict: 'weak', score: 40, reasons: ['weak'] },
          ],
        },
      },
    }]);

    expect(screen.getByTestId('generation-trust-banner')).toBeInTheDocument();
    expect(screen.getByTestId('generation-visual-quality')).toHaveTextContent('Visual Quality');
    expect(screen.getByTestId('generation-visual-quality')).toHaveTextContent('Low');
    expect(screen.getByTestId('generation-visual-quality')).toHaveTextContent('Needs visual cleanup');
    expect(screen.getByTestId('generation-visual-quality-reasons')).toHaveTextContent('Weak hierarchy');
    expect(screen.getByTestId('generation-visual-quality-reasons')).toHaveTextContent('Crowded layout');
    expect(screen.getByTestId('generation-visual-quality-reasons')).toHaveTextContent('Inconsistent spacing rhythm');
    expect(screen.getByTestId('generation-visual-quality-reasons')).toHaveTextContent('Missing empty/loading/error polish');
    expect(screen.getByTestId('generation-visual-polish')).toHaveTextContent('Visual polish');
    expect(screen.getByTestId('generation-visual-polish')).toHaveTextContent('Polished');
    expect(screen.getByTestId('generation-visual-polish')).toHaveTextContent('One quiet visual polish pass ran before finish.');
  });

  test('localizes visual quality labels and reasons', () => {
    render(
      <LeftPanel
        messages={[{
          id: 'report-visual-quality-es',
          role: 'assistant',
          type: 'generation-report',
          content: 'Aplicación lista',
          timestamp: Date.now(),
          report: {
            mode: 'EDIT',
            theme: 'default',
            filesCreated: [],
            filesModified: ['src/App.tsx'],
            pageCount: 0,
            duration: 5,
            visualPolish: {
              mode: 'architect_guided',
              outcome: 'failed',
              attempts: 1,
              maxPasses: 1,
              triggerReasons: ['CTA not prominent'],
            },
            visualQuality: {
              verdict: 'acceptable',
              band: 'medium',
              score: 67,
              reasons: [],
              dimensions: [
                { id: 'visual-hierarchy', verdict: 'acceptable', score: 66, reasons: ['ok'] },
                { id: 'spacing-consistency', verdict: 'acceptable', score: 68, reasons: ['ok'] },
                { id: 'cta-prominence', verdict: 'weak', score: 48, reasons: ['weak'] },
                { id: 'mobile-fit', verdict: 'acceptable', score: 64, reasons: ['ok'] },
              ],
            },
          },
        }] as any}
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
        appLanguage="es"
      />,
    );

    expect(screen.getByTestId('generation-visual-quality')).toHaveTextContent('Calidad visual');
    expect(screen.getByTestId('generation-visual-quality')).toHaveTextContent('Media');
    expect(screen.getByTestId('generation-visual-quality')).toHaveTextContent('Visualmente aceptable');
    expect(screen.getByTestId('generation-visual-quality-reasons')).toHaveTextContent('La CTA no domina visualmente');
    expect(screen.getByTestId('generation-visual-polish')).toHaveTextContent('Pulido visual');
    expect(screen.getByTestId('generation-visual-polish')).toHaveTextContent('Se mantuvo la versiÃ³n segura');
  });
});
