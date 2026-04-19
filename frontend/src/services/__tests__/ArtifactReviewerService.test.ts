import { describe, it, expect } from 'vitest';
import { ArtifactReviewerService } from '../ArtifactReviewerService';
import type { ArtifactContract } from '../../types/artifact';
import type { AgentExecutionRoute } from '../buildAgentRouting';

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

  it('throws ARTIFACT_SEMANTIC_PARSE_FAIL instead of REVIEWER_FAIL when all files are poisoned', () => {
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

    expect(() => ArtifactReviewerService.review(artifact))
      .toThrow('ARTIFACT_SEMANTIC_PARSE_FAIL: 0 files after heuristic repair');
  });
});

// ─── reviewWithAI — semantic failure path ─────────────────────────────────────

describe('ArtifactReviewerService.reviewWithAI', () => {
  const noopLog = () => {};
  const fakeRoute: AgentExecutionRoute = {
    endpoint:  'https://example.com',
    apiKey:    '',
    modelId:   'fake-model',
    slot:      'qa',
    provider:  'openrouter',
    keySource: 'agent-config',
    reason:    'test stub',
  };

  it('throws ARTIFACT_SEMANTIC_PARSE_FAIL (not REVIEWER_FAIL) when all files are nested envelopes', async () => {
    // The previous production failure: poisoned artifact → heuristic drops all → hard throw
    // After fix: throw message must start with ARTIFACT_SEMANTIC_PARSE_FAIL so
    // SimpleGeneration can catch and convert it to a retryable failure.
    const artifact: ArtifactContract = {
      revisionId: 'rev-all-poison',
      entry: 'src/App.tsx',
      files: [
        {
          path: 'src/App.tsx',
          content: '{"artifact":{"entry":"src/App.tsx","files":[{"path":"src/App.tsx","content":"real code here"}],"content":"x"}}',
        },
      ],
    };

    await expect(
      ArtifactReviewerService.reviewWithAI({
        intent: 'test',
        artifact,
        qaRoute: fakeRoute,
        onLog:   noopLog,
      }),
    ).rejects.toThrow(/^ARTIFACT_SEMANTIC_PARSE_FAIL:/);
  });

  it('does NOT throw when a valid artifact is passed (passes straight through)', async () => {
    // QA route has no API key → heuristic-only path, no AI call
    const artifact: ArtifactContract = {
      revisionId: 'rev-valid',
      entry: 'src/App.tsx',
      files: [
        { path: 'src/App.tsx', content: 'export default function App() { return <div>hello</div>; }' },
      ],
    };

    const result = await ArtifactReviewerService.reviewWithAI({
      intent:  'test',
      artifact,
      qaRoute: fakeRoute, // no apiKey → heuristic only
      onLog:   noopLog,
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/App.tsx');
  });

  it('extracts real code from a single nested-envelope file instead of dropping it (partial recovery)', async () => {
    // One poisoned file that contains a nested envelope from which real code CAN be extracted.
    const innerContent = 'export default function App() { return <div>extracted</div>; }';
    const envelopeContent = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [{ path: 'src/App.tsx', content: innerContent }],
      },
    });
    const artifact: ArtifactContract = {
      revisionId: 'rev-extractable',
      entry: 'src/App.tsx',
      files: [{ path: 'src/App.tsx', content: envelopeContent }],
    };

    // Should NOT throw — heuristic can extract the inner content
    const result = await ArtifactReviewerService.reviewWithAI({
      intent:  'test',
      artifact,
      qaRoute: fakeRoute,
      onLog:   noopLog,
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0].content).toBe(innerContent);
  });
});
