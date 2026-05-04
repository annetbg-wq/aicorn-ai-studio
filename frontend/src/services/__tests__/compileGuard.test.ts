import { beforeEach, describe, expect, it, vi } from 'vitest';

const compileCandidate = vi.fn();
const writeCandidateFile = vi.fn();
const getRevisionFiles = vi.fn();
const dispatch = vi.fn();

vi.mock('../RevisionManager', () => ({
  revisionManager: {
    compileCandidate,
    writeCandidateFile,
    getRevisionFiles,
  },
}));

vi.mock('../studioCommandBus', () => ({
  commandBus: {
    dispatch,
  },
}));

describe('compileGuard bounded repair loop', () => {
  beforeEach(() => {
    compileCandidate.mockReset();
    writeCandidateFile.mockReset();
    getRevisionFiles.mockReset();
    dispatch.mockReset();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/__read_preview?path=')) {
        return {
          ok: true,
          json: async () => ({ ok: true, content: 'export default function App() { return <main>Current</main>; }' }),
        };
      }
      return {
        ok: false,
        json: async () => ({}),
      };
    }));
  });

  it('fatal failure triggers a bounded repair attempt', async () => {
    getRevisionFiles.mockReturnValue({ 'App.tsx': 'export default function App() { return null; }' });
    compileCandidate
      .mockResolvedValueOnce({
        success: false,
        errors: ['Failed to resolve import "./NewPanel" from "src/App.tsx"'],
      })
      .mockResolvedValueOnce({
        success: true,
      });

    const { compileWithRetry } = await import('../compileGuard');
    const logs: string[] = [];

    const result = await compileWithRetry({
      revId: 'rev-fatal',
      apiKey: 'test',
      onLog: (msg) => logs.push(msg),
      callFix: async () => JSON.stringify({
        artifact: {
          files: [
            {
              path: 'NewPanel.tsx',
              content: 'export default function NewPanel() { return <div>New</div>; }',
            },
          ],
        },
      }),
      recheckAdmission: vi.fn().mockResolvedValue(true),
    });

    expect(result.success).toBe(true);
    expect(result.stopReason).toBe('repair_succeeded');
    expect(result.minimumViableCandidate).toBe(true);
    expect(result.partialShip).toBe(false);
    expect(result.attempts).toBe(2);
    expect(writeCandidateFile).toHaveBeenCalledWith(
      'rev-fatal',
      '/NewPanel.tsx',
      'export default function NewPanel() { return <div>New</div>; }',
    );
    expect(logs.some(msg => msg.includes('Failure classified: fatal'))).toBe(true);
    expect(logs.some(msg => msg.includes('Repair attempt 1/2 started'))).toBe(true);
    expect(logs.some(msg => msg.includes('Final stop reason: repair_succeeded'))).toBe(true);
  });

  it('non-fatal issue does not force unnecessary repair', async () => {
    const { compileWithRetry } = await import('../compileGuard');
    const logs: string[] = [];
    const callFix = vi.fn();

    const result = await compileWithRetry({
      revId: 'rev-non-fatal',
      apiKey: 'test',
      onLog: (msg) => logs.push(msg),
      initialFailureErrors: ['Warning: missing decorative asset logo.svg'],
      callFix,
    });

    expect(result.success).toBe(false);
    expect(result.outcome).toBe('non_fatal_non_viable');
    expect(result.stopReason).toBe('non_fatal_issue_no_repair');
    expect(result.failureClassification?.severity).toBe('non_fatal');
    expect(result.attempts).toBe(1);
    expect(callFix).not.toHaveBeenCalled();
    expect(compileCandidate).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'PREVIEW_FAILED',
      error: 'Warning: missing decorative asset logo.svg',
    });
    expect(logs.some(msg => msg.includes('Repair decision: no_repair_needed'))).toBe(true);
  });

  it('non-fatal issue can survive via degraded acceptable path without entering repair', async () => {
    getRevisionFiles.mockReturnValue({
      'BrokenPage.tsx': 'export default function BrokenPage() { return null; }',
    });
    compileCandidate.mockResolvedValueOnce({
      success: true,
    });

    const { compileWithRetry } = await import('../compileGuard');
    const logs: string[] = [];
    const callFix = vi.fn();

    const result = await compileWithRetry({
      revId: 'rev-non-fatal-degraded',
      apiKey: 'test',
      onLog: (msg) => logs.push(msg),
      initialFailureErrors: ['Failed to resolve import "./logo.svg" from "src/BrokenPage.tsx"'],
      callFix,
    });

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('non_fatal_degraded_acceptable');
    expect(result.stopReason).toBe('non_fatal_degraded_acceptable');
    expect(result.partialShip).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.minimumViableCandidate).toBe(true);
    expect(result.attempts).toBe(2);
    expect(callFix).not.toHaveBeenCalled();
    expect(compileCandidate).toHaveBeenCalledTimes(1);
    expect(writeCandidateFile).toHaveBeenCalledWith(
      'rev-non-fatal-degraded',
      '/BrokenPage.tsx',
      expect.stringContaining('This page encountered an error'),
    );
    expect(logs.some(msg => msg.includes('Repair decision: no_repair_needed'))).toBe(true);
    expect(logs.some(msg => msg.includes('Final stop reason: non_fatal_degraded_acceptable'))).toBe(true);
  });

  it('stops early when repeated failures show no progress', async () => {
    getRevisionFiles.mockReturnValue({ 'App.tsx': 'export default function App() { return null; }' });
    compileCandidate
      .mockResolvedValueOnce({
        success: false,
        errors: ['Failed to resolve import "./SamePanel" from "src/App.tsx"'],
      })
      .mockResolvedValueOnce({
        success: true,
      });

    const { compileWithRetry } = await import('../compileGuard');
    const logs: string[] = [];
    const callFix = vi.fn().mockResolvedValue(JSON.stringify({
      artifact: {
        files: [
          {
            path: 'SamePanel.tsx',
            content: 'export default function SamePanel() { return <div>Same</div>; }',
          },
        ],
      },
    }));

    const result = await compileWithRetry({
      revId: 'rev-no-progress',
      apiKey: 'test',
      onLog: (msg) => logs.push(msg),
      initialFailureErrors: ['Failed to resolve import "./SamePanel" from "src/App.tsx"'],
      callFix,
      recheckAdmission: vi.fn().mockResolvedValue(true),
    });

    expect(result.partialShip).toBe(true);
    expect(result.attempts).toBe(3);
    expect(callFix).toHaveBeenCalledTimes(1);
    expect(logs.some(msg => msg.includes('Progress evaluated: no_progress'))).toBe(true);
    expect(logs.some(msg => msg.includes('Repair decision: stop (no_progress)'))).toBe(true);
  });

  it('stops when repair budget is exhausted', async () => {
    getRevisionFiles.mockReturnValue({ 'App.tsx': 'export default function App() { return null; }' });
    compileCandidate
      .mockResolvedValueOnce({
        success: false,
        errors: ['Runtime bootstrap changed in src/App.tsx'],
      })
      .mockResolvedValueOnce({
        success: false,
        errors: ['Yet another runtime break in src/App.tsx'],
      })
      .mockResolvedValueOnce({
        success: false,
        errors: ['Partial ship also failed'],
      });

    const { compileWithRetry } = await import('../compileGuard');
    const logs: string[] = [];
    const callFix = vi.fn()
      .mockResolvedValue(JSON.stringify({
        artifact: {
          files: [{ path: 'App.tsx', content: 'export default function App() { return <main>Fix 1</main>; }' }],
        },
      }))
      .mockResolvedValueOnce(JSON.stringify({
        artifact: {
          files: [{ path: 'App.tsx', content: 'export default function App() { return <main>Fix 2</main>; }' }],
        },
      }));

    const result = await compileWithRetry({
      revId: 'rev-budget',
      apiKey: 'test',
      onLog: (msg) => logs.push(msg),
      initialFailureErrors: ['Recoverable compile failure in src/App.tsx'],
      callFix,
      recheckAdmission: vi.fn().mockResolvedValue(true),
    });

    expect(result.success).toBe(false);
    expect(result.stopReason).toBe('repair_budget_exhausted');
    expect(result.budgetExhausted).toBe(true);
    expect(result.partialShip).toBe(false);
    expect(result.attempts).toBe(4);
    expect(callFix).toHaveBeenCalledTimes(2);
    expect(logs.some(msg => msg.includes('Repair budget exhausted'))).toBe(true);
    expect(logs.some(msg => msg.includes('Final stop reason: repair_budget_exhausted'))).toBe(true);
  });

  it('allows partial ship only when a minimum viable candidate boots after degradation', async () => {
    getRevisionFiles.mockReturnValue({ 'BrokenPage.tsx': 'export default function BrokenPage() { return null; }' });
    compileCandidate.mockResolvedValueOnce({
      success: true,
    });

    const { compileWithRetry } = await import('../compileGuard');
    const logs: string[] = [];

    const result = await compileWithRetry({
      revId: 'rev-partial',
      apiKey: 'test',
      onLog: (msg) => logs.push(msg),
      initialFailureErrors: ['Module exploded in src/BrokenPage.tsx during startup'],
      callFix: async () => '',
    });

    expect(result.success).toBe(true);
    expect(result.partialShip).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.minimumViableCandidate).toBe(true);
    expect(result.stopReason).toBe('partial_ship');
    expect(writeCandidateFile).toHaveBeenCalledWith(
      'rev-partial',
      '/BrokenPage.tsx',
      expect.stringContaining('This page encountered an error'),
    );
    expect(logs.some(msg => msg.includes('Repair decision: partial_ship'))).toBe(true);
  });

  it('does not partial-ship when the degraded candidate still cannot boot', async () => {
    getRevisionFiles.mockReturnValue({ 'BrokenPage.tsx': 'export default function BrokenPage() { return null; }' });
    compileCandidate.mockResolvedValueOnce({
      success: false,
      errors: ['Still broken after stub'],
    });

    const { compileWithRetry } = await import('../compileGuard');

    const result = await compileWithRetry({
      revId: 'rev-no-partial',
      apiKey: 'test',
      onLog: () => {},
      initialFailureErrors: ['Module exploded in src/BrokenPage.tsx during startup'],
      callFix: async () => '',
    });

    expect(result.success).toBe(false);
    expect(result.partialShip).toBe(false);
    expect(result.minimumViableCandidate).toBe(false);
  });

  it('never writes JSX route fallback into non-route TypeScript infrastructure files', async () => {
    getRevisionFiles.mockReturnValue({
      'hooks/useTheme.ts': 'export function useTheme() { return { resolved: "light" as const }; }',
    });

    const { compileWithRetry } = await import('../compileGuard');
    const logs: string[] = [];

    const result = await compileWithRetry({
      revId: 'rev-hook-infra',
      apiKey: 'test',
      onLog: (msg) => logs.push(msg),
      initialFailureErrors: [
        'vite build exited 1: Could not load C:/ai_studio/preview-workspace/src/config/theme (imported by src/hooks/useTheme.ts)',
      ],
      callFix: async () => '',
    });

    expect(result.success).toBe(false);
    expect(result.stopReason).toBe('partial_ship_blocked_for_non_route_file');
    expect(writeCandidateFile).not.toHaveBeenCalledWith(
      'rev-hook-infra',
      '/hooks/useTheme.ts',
      expect.stringContaining('className='),
    );
    expect(logs.some(msg => msg.includes('Partial ship blocked for non-route file: hooks/useTheme.ts'))).toBe(true);
  });

  it('does not widen the candidate file set without admission approval', async () => {
    getRevisionFiles.mockReturnValue({ 'App.tsx': 'export default function App() { return null; }' });
    compileCandidate.mockResolvedValueOnce({
      success: true,
    });

    const { compileWithRetry } = await import('../compileGuard');
    const recheckAdmission = vi.fn().mockResolvedValue(false);

    const result = await compileWithRetry({
      revId: 'rev-1',
      apiKey: 'test',
      onLog: () => {},
      initialFailureErrors: ['Failed to resolve import "./NewPanel" from "src/App.tsx"'],
      callFix: async () => JSON.stringify({
        artifact: {
          files: [
            {
              path: 'NewPanel.tsx',
              content: 'export default function NewPanel() { return <div>New</div>; }',
            },
          ],
        },
      }),
      recheckAdmission,
    });

    expect(recheckAdmission).toHaveBeenCalledWith(['App.tsx', 'NewPanel.tsx']);
    expect(writeCandidateFile).not.toHaveBeenCalledWith(
      'rev-1',
      '/NewPanel.tsx',
      expect.any(String),
    );
    expect(result.success).toBe(true);
    expect(result.partialShip).toBe(true);
  });

  it('writes newly introduced files only after admission recheck approval', async () => {
    getRevisionFiles.mockReturnValue({ 'App.tsx': 'export default function App() { return null; }' });
    compileCandidate.mockResolvedValueOnce({
      success: true,
    });

    const { compileWithRetry } = await import('../compileGuard');
    const recheckAdmission = vi.fn().mockResolvedValue(true);

    const result = await compileWithRetry({
      revId: 'rev-2',
      apiKey: 'test',
      onLog: () => {},
      initialFailureErrors: ['Failed to resolve import "./NewPanel" from "src/App.tsx"'],
      callFix: async () => JSON.stringify({
        artifact: {
          files: [
            {
              path: 'NewPanel.tsx',
              content: 'export default function NewPanel() { return <div>New</div>; }',
            },
          ],
        },
      }),
      recheckAdmission,
    });

    expect(recheckAdmission).toHaveBeenCalledWith(['App.tsx', 'NewPanel.tsx']);
    expect(writeCandidateFile).toHaveBeenCalledWith(
      'rev-2',
      '/NewPanel.tsx',
      'export default function NewPanel() { return <div>New</div>; }',
    );
    expect(result.success).toBe(true);
    expect(result.partialShip).toBe(false);
  });
});
