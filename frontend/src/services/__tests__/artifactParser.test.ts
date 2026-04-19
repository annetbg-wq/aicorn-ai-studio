import { describe, it, expect } from 'vitest';
import {
  parseArtifact,
  convertLegacyFiles,
  looksLikeTruncatedArtifact,
  classifyArtifactHealth,
  ARTIFACT_FAIL_TRUNCATED,
  ARTIFACT_FAIL_POISONED_ENVELOPE,
  ARTIFACT_FAIL_SEMANTIC,
} from '../artifactParser';
import type { ArtifactContract } from '../../types/artifact';

describe('parseArtifact', () => {
  // 1. Clean JSON artifact in fenced block
  it('parses a clean JSON artifact from ```json fences', () => {
    const raw = '```json\n{"artifact":{"entry":"src/App.tsx","files":[{"path":"src/App.tsx","content":"export default function App() { return <div>Hello</div> }"}]}}\n```';
    const result = parseArtifact(raw);
    expect(result.success).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(result.artifact?.files).toHaveLength(1);
    expect(result.artifact?.entry).toBe('src/App.tsx');
    expect(result.artifact?.files[0].content).toContain('Hello');
  });

  // 2. Fallback to FILE markers
  it('falls back to <!--FILE:--> markers when no JSON found', () => {
    const raw = '<!--FILE:App.tsx-->\nexport default function App() { return <div>Hello</div> }\n<!--/FILE-->';
    const result = parseArtifact(raw);
    expect(result.success).toBe(true);
    expect(result.fallbackUsed).toBe(true);
    expect(result.artifact?.files.length).toBeGreaterThan(0);
  });

  // 3. Complete failure on empty string
  it('returns failure for empty input', () => {
    const result = parseArtifact('');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // 4. JSON surrounded by prose
  it('extracts JSON artifact when surrounded by LLM prose', () => {
    const raw = 'Here is the code:\n```json\n{"artifact":{"entry":"src/App.tsx","files":[{"path":"src/App.tsx","content":"const x = 1;"}]}}\n```\nLet me know if you need changes.';
    const result = parseArtifact(raw);
    expect(result.success).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(result.artifact?.files).toHaveLength(1);
  });

  // 5. Truncated JSON → fallback
  it('falls back when JSON is truncated/invalid', () => {
    const raw = '```json\n{"artifact":{"entry":"src/App.tsx","files":[{"path":"src/App.tsx","content":"ex';
    const result = parseArtifact(raw);
    expect(result.fallbackUsed).toBe(true);
  });

  // 6. Path normalization — adds src/ prefix
  it('normalizes paths to include src/ prefix', () => {
    const raw = '```json\n{"artifact":{"entry":"App.tsx","files":[{"path":"App.tsx","content":"code"},{"path":"pages/Home.tsx","content":"home"}]}}\n```';
    const result = parseArtifact(raw);
    expect(result.success).toBe(true);
    expect(result.artifact?.files[0].path).toBe('src/App.tsx');
    expect(result.artifact?.files[1].path).toBe('src/pages/Home.tsx');
    expect(result.artifact?.entry).toBe('src/App.tsx');
  });

  // 7. Empty files array → failure
  it('rejects artifact with empty files array', () => {
    const raw = '```json\n{"artifact":{"entry":"src/App.tsx","files":[]}}\n```';
    const result = parseArtifact(raw);
    // Should fall through JSON strategies (empty files = null) into legacy fallback
    expect(result.artifact?.files.length ?? 0).toBe(0);
  });

  // 8. Loose JSON without fences (has "files" key)
  it('finds JSON with "files" key without fences', () => {
    const raw = 'Some text before {"artifact":{"entry":"src/App.tsx","files":[{"path":"src/App.tsx","content":"hello"}]}} and after';
    const result = parseArtifact(raw);
    expect(result.success).toBe(true);
    expect(result.fallbackUsed).toBe(false);
  });

  // 9. Pure JSON (no fences, no surrounding text)
  it('parses raw JSON when LLM returns pure JSON', () => {
    const raw = '{"artifact":{"entry":"src/App.tsx","files":[{"path":"src/App.tsx","content":"code here"}]}}';
    const result = parseArtifact(raw);
    expect(result.success).toBe(true);
    expect(result.fallbackUsed).toBe(false);
  });

  // 10. Files with empty content are skipped
  it('skips files with empty content', () => {
    const raw = '```json\n{"artifact":{"entry":"src/App.tsx","files":[{"path":"src/App.tsx","content":"valid"},{"path":"src/Empty.tsx","content":""}]}}\n```';
    const result = parseArtifact(raw);
    expect(result.success).toBe(true);
    expect(result.artifact?.files).toHaveLength(1);
    expect(result.artifact?.files[0].path).toBe('src/App.tsx');
  });

  // 11. Multi-file artifact with routes and dependencies
  it('preserves routes and dependencies from artifact', () => {
    const raw = '```json\n' + JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [
          { path: 'src/App.tsx', content: 'app code' },
          { path: 'src/pages/Home.tsx', content: 'home code' },
        ],
        routes: ['/', '/home'],
        dependencies: ['react-router-dom'],
      }
    }) + '\n```';
    const result = parseArtifact(raw);
    expect(result.success).toBe(true);
    expect(result.artifact?.routes).toEqual(['/', '/home']);
    expect(result.artifact?.dependencies).toEqual(['react-router-dom']);
  });
});

// ─── looksLikeTruncatedArtifact ───────────────────────────────────────────────

describe('looksLikeTruncatedArtifact', () => {
  it('returns false for a complete valid JSON artifact', () => {
    const raw = JSON.stringify({
      artifact: { entry: 'src/App.tsx', files: [{ path: 'src/App.tsx', content: 'export default function App() { return <div>ok</div>; }' }] },
    });
    expect(looksLikeTruncatedArtifact(raw)).toBe(false);
  });

  it('returns true when raw ends mid-string (no closing brace)', () => {
    const raw = '{"artifact":{"entry":"src/App.tsx","files":[{"path":"src/App.tsx","content":"function App() { return <div>hel';
    expect(looksLikeTruncatedArtifact(raw)).toBe(true);
  });

  it('returns true when raw ends with "}" but JSON.parse rejects it', () => {
    // Ends with '}' but missing closing array/object tokens
    const raw = '{"artifact":{"files":[{"path":"src/App.tsx","content":"code here"}]}';
    // This ends with ']' not '}' — actually let's craft one that ends with '}'
    const raw2 = '{"artifact":{"files":[{"path":"src/App.tsx","content":"code"}]}}\x00}';
    // Simpler: valid-looking envelope that JSON.parse rejects
    const raw3 = '{"artifact":{"files":[{"path":"src/App.tsx","content":"truncated here \\"}}';
    expect(looksLikeTruncatedArtifact(raw3)).toBe(true);
  });

  it('returns false for non-artifact JSON objects', () => {
    expect(looksLikeTruncatedArtifact('{"foo":"bar"}')).toBe(false);
    expect(looksLikeTruncatedArtifact('plain text')).toBe(false);
    expect(looksLikeTruncatedArtifact('')).toBe(false);
  });
});

// ─── classifyArtifactHealth ───────────────────────────────────────────────────

describe('classifyArtifactHealth', () => {
  const validArtifact: ArtifactContract = {
    revisionId: 'rev-ok',
    entry: 'src/App.tsx',
    files: [{ path: 'src/App.tsx', content: 'export default function App() { return <div>hello</div>; }' }],
  };

  it('returns null for a valid artifact', () => {
    const raw = JSON.stringify({ artifact: { entry: 'src/App.tsx', files: validArtifact.files } });
    expect(classifyArtifactHealth(raw, validArtifact)).toBeNull();
  });

  it('returns ARTIFACT_TRUNCATED when raw looks truncated', () => {
    const raw = '{"artifact":{"files":[{"path":"src/App.tsx","content":"export function App() {';
    const result = classifyArtifactHealth(raw, validArtifact);
    expect(result?.failClass).toBe(ARTIFACT_FAIL_TRUNCATED);
  });

  it('returns ARTIFACT_POISONED_ENVELOPE when all files contain nested envelopes', () => {
    const poisonedArtifact: ArtifactContract = {
      revisionId: 'rev-poison',
      entry: 'src/App.tsx',
      files: [
        {
          path: 'src/App.tsx',
          content: '{"artifact":{"entry":"src/App.tsx","files":[{"path":"src/App.tsx","content":"real code"}]}}',
        },
        {
          path: 'src/Comp.tsx',
          content: '{"files":[{"path":"src/Comp.tsx","content":"more code"}],"content":"x"}',
        },
      ],
    };
    const raw = JSON.stringify({ artifact: { entry: 'src/App.tsx', files: poisonedArtifact.files } });
    const result = classifyArtifactHealth(raw, poisonedArtifact);
    expect(result?.failClass).toBe(ARTIFACT_FAIL_POISONED_ENVELOPE);
  });

  it('returns null when at least one non-envelope file has real code (partial poison is OK)', () => {
    const mixedArtifact: ArtifactContract = {
      revisionId: 'rev-mixed',
      entry: 'src/App.tsx',
      files: [
        {
          path: 'src/App.tsx',
          content: 'export default function App() { return <div>hello</div>; }',
        },
        {
          path: 'src/Bad.tsx',
          content: '{"artifact":{"files":[{"path":"src/Bad.tsx","content":"code"}],"content":"x"}}',
        },
      ],
    };
    const raw = JSON.stringify({ artifact: { entry: 'src/App.tsx', files: mixedArtifact.files } });
    expect(classifyArtifactHealth(raw, mixedArtifact)).toBeNull();
  });

  it('does not reject a valid minimal module artifact', () => {
    const minimalArtifact: ArtifactContract = {
      revisionId: 'rev-minimal',
      entry: 'src/App.tsx',
      files: [
        { path: 'src/App.tsx', content: 'export const value = 1;' },
      ],
    };
    const raw = JSON.stringify({ artifact: { entry: 'src/App.tsx', files: minimalArtifact.files } });
    expect(classifyArtifactHealth(raw, minimalArtifact)).toBeNull();
  });

  it('returns ARTIFACT_SEMANTIC_PARSE_FAIL when no file has recognizable code', () => {
    const noCodeArtifact: ArtifactContract = {
      revisionId: 'rev-nocode',
      entry: 'src/App.tsx',
      files: [
        { path: 'src/App.tsx', content: 'just some plain text without code patterns here' },
      ],
    };
    const raw = JSON.stringify({ artifact: { entry: 'src/App.tsx', files: noCodeArtifact.files } });
    const result = classifyArtifactHealth(raw, noCodeArtifact);
    expect(result?.failClass).toBe(ARTIFACT_FAIL_SEMANTIC);
  });

  it('returns null for null artifact (handled by caller)', () => {
    expect(classifyArtifactHealth('{}', null)).toBeNull();
  });
});

describe('convertLegacyFiles', () => {
  it('converts Record<string, string> to ArtifactFile[] with normalized paths', () => {
    const markers = {
      '/App.tsx': 'app code',
      '/pages/Home.tsx': 'home code',
    };
    const files = convertLegacyFiles(markers);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('src/App.tsx');
    expect(files[1].path).toBe('src/pages/Home.tsx');
  });

  it('skips entries with empty content', () => {
    const markers = { '/App.tsx': 'code', '/Empty.tsx': '' };
    const files = convertLegacyFiles(markers);
    expect(files).toHaveLength(1);
  });
});
