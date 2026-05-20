import { describe, expect, it } from 'vitest';

import { scanBeforePreviewLoad } from '../../services/projectCorruptionScan';
import { getSkeletonSaveFiles, resolveReloadCompleteSaveFiles } from '../useStudioSaveFiles';

describe('resolveReloadCompleteSaveFiles', () => {
  it('persists the reload-complete preview graph instead of a delta-only save map', () => {
    const result = resolveReloadCompleteSaveFiles({
      existingFiles: null,
      skeletonFiles: {
        'App.tsx': 'export default function App() { return <main>ok</main>; }',
        'main.tsx': 'import App from "./App";',
        'components/Shell.tsx': 'export function Shell() { return null; }',
      },
      pendingFinalFiles: {
        'config/app.ts': 'export const app = {};',
        'pages/Home.tsx': 'export default function Home() { return <section>Home</section>; }',
      },
    });

    expect(result.errorMessage).toBeUndefined();
    expect(result.files).toEqual({
      'App.tsx': 'export default function App() { return <main>ok</main>; }',
      'main.tsx': 'import App from "./App";',
      'components/Shell.tsx': 'export function Shell() { return null; }',
      'config/app.ts': 'export const app = {};',
      'pages/Home.tsx': 'export default function Home() { return <section>Home</section>; }',
    });
  });

  it('rejects save when the merged graph is still missing App.tsx/main.tsx', () => {
    const result = resolveReloadCompleteSaveFiles({
      existingFiles: null,
      skeletonFiles: null,
      pendingFinalFiles: {
        'config/app.ts': 'export const app = {};',
        'pages/Home.tsx': 'export default function Home() { return <section>Home</section>; }',
      },
    });

    expect(result.errorMessage).toBe('Cannot save reload-incomplete project: missing App.tsx/main.tsx');
    expect(result.findings.some(finding => finding.kind === 'missing-entry')).toBe(true);
  });

  it('loads the real saas-dashboard shell files from the installed skeleton source', () => {
    const files = getSkeletonSaveFiles('saas-dashboard');

    expect(files['App.tsx']).toContain('BrowserRouter');
    expect(files['main.tsx']).toContain('createRoot');
  });
});

describe('save-time guard scope', () => {
  it('keeps missing-entry as a warning for generic preload scans', () => {
    const result = scanBeforePreviewLoad('proj-1', {
      'config/app.ts': 'export const app = {};',
      'pages/Home.tsx': 'export default function Home() { return <section>Home</section>; }',
    }, 'test');

    expect(result.safe).toBe(true);
    expect(result.findings.some(finding => finding.kind === 'missing-entry')).toBe(true);
  });
});