import { describe, expect, it } from 'vitest';
import { validateProtectedShellBoundary } from '../LiveGenerationContractValidator';

// Regression: product slots may consume manifest-declared route config without taking router ownership.
describe('LiveGenerationContract manifest ownership', () => {
  it('allows a mobile product page to consume manifest-declared editable route config', () => {
    const createPage = [
      "import { useNavigate } from 'react-router-dom';",
      "import { ROUTES } from '@/config/routes';",
      'export default function Create() {',
      '  const navigate = useNavigate();',
      '  return <button onClick={() => navigate(ROUTES.home)}>Save</button>;',
      '}',
    ].join('\n');

    const result = validateProtectedShellBoundary({
      finalFiles: {
        'src/main.tsx': 'export {};',
        'src/App.tsx': 'export default function App() { return null; }',
        'src/route-manifest.json': '{}',
        'src/config/routes.ts': "export const ROUTES = { home: '/' } as const;",
        'src/pages/Create.tsx': createPage,
      },
      generatedDeltaFiles: {
        'src/pages/Create.tsx': createPage,
      },
      skeletonId: 'mobile-app',
    });

    expect(result.diagnostics.filter(d => d.root_cause_type === 'protected_shell_import')).toEqual([]);
  });

  it('still blocks page-level router ownership APIs', () => {
    const createPage = [
      "import { Routes, Route } from 'react-router-dom';",
      'export default function Create() {',
      '  return <Routes><Route path="/" element={null} /></Routes>;',
      '}',
    ].join('\n');

    const result = validateProtectedShellBoundary({
      finalFiles: {
        'src/main.tsx': 'export {};',
        'src/App.tsx': 'export default function App() { return null; }',
        'src/pages/Create.tsx': createPage,
      },
      generatedDeltaFiles: {
        'src/pages/Create.tsx': createPage,
      },
      skeletonId: 'mobile-app',
    });

    expect(result.diagnostics.some(d =>
      d.root_cause_type === 'protected_shell_import' && d.import_path === 'react-router-dom',
    )).toBe(true);
  });
});
