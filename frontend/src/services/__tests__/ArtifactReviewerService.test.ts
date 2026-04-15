import { describe, it, expect } from 'vitest';
import { ArtifactReviewerService } from '../ArtifactReviewerService';
import type { ArtifactContract } from '../../types/artifact';

describe('ArtifactReviewerService', () => {
  it('removes files whose content is a nested artifact JSON', () => {
    const artifact: ArtifactContract = {
      revisionId: 'rev-1',
      entry: 'src/App.tsx',
      files: [
        {
          path: 'src/Poison.tsx',
          content: '{"files":[{"path":"src/App.tsx","content":"bad"}]}',
        },
        {
          path: 'src/App.tsx',
          content: 'export default function App() { return <div>ok</div>; }',
        },
      ],
    };

    const reviewed = ArtifactReviewerService.review(artifact);
    expect(reviewed.files).toHaveLength(1);
    expect(reviewed.files[0].path).toBe('src/App.tsx');
  });

  it('throws REVIEWER_FAIL when all files are poisoned and removed', () => {
    const artifact: ArtifactContract = {
      revisionId: 'rev-2',
      entry: 'src/App.tsx',
      files: [
        {
          path: 'src/App.tsx',
          content: '{"files":[{"path":"src/App.tsx","content":"bad"}]}',
        },
      ],
    };

    expect(() => ArtifactReviewerService.review(artifact)).toThrow('REVIEWER_FAIL: 0 files after cleaning');
  });
});
