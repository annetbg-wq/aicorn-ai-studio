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

describe('compileGuard admission recheck', () => {
  beforeEach(() => {
    compileCandidate.mockReset();
    writeCandidateFile.mockReset();
    getRevisionFiles.mockReset();
    dispatch.mockReset();
  });

  it('does not widen the candidate file set without admission approval', async () => {
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
    const recheckAdmission = vi.fn().mockResolvedValue(false);

    const result = await compileWithRetry({
      revId: 'rev-1',
      apiKey: 'test',
      onLog: () => {},
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
  });

  it('writes newly introduced files only after admission recheck approval', async () => {
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
    const recheckAdmission = vi.fn().mockResolvedValue(true);

    const result = await compileWithRetry({
      revId: 'rev-2',
      apiKey: 'test',
      onLog: () => {},
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
  });
});
