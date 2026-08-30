import { describe, expect, it } from 'vitest';
import { validateProtectedShellBoundary } from '../LiveGenerationContractValidator';

// Ownership semantics regression: editable may change, read-only may be consumed,
// and infrastructure owners remain protected from product-level ownership takeover.
// Live canary fixtures are contract-aware separately; production generation is unchanged here.
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

  it('allows product pages to consume reusable read-only skeleton components', () => {
    const detailPage = [
      "import EmptyState from '@/components/EmptyState';",
      'export default function Detail() {',
      '  return <EmptyState />;',
      '}',
    ].join('\n');

    const result = validateProtectedShellBoundary({
      finalFiles: {
        'src/main.tsx': 'export {};',
        'src/App.tsx': 'export default function App() { return null; }',
        'src/components/EmptyState.tsx': 'export default function EmptyState() { return null; }',
        'src/pages/Detail.tsx': detailPage,
      },
      generatedDeltaFiles: {},
      skeletonId: 'mobile-app',
    });

    expect(result.diagnostics.filter(d => d.root_cause_type === 'protected_shell_import')).toEqual([]);
  });

  it('still blocks importing an actual navigation-shell owner into a product page', () => {
    const detailPage = [
      "import BottomTabs from '@/components/BottomTabs';",
      'export default function Detail() {',
      '  return <BottomTabs />;',
      '}',
    ].join('\n');

    const result = validateProtectedShellBoundary({
      finalFiles: {
        'src/main.tsx': 'export {};',
        'src/App.tsx': 'export default function App() { return null; }',
        'src/components/BottomTabs.tsx': 'export default function BottomTabs() { return null; }',
        'src/pages/Detail.tsx': detailPage,
      },
      generatedDeltaFiles: { 'src/pages/Detail.tsx': detailPage },
      skeletonId: 'mobile-app',
    });

    expect(result.diagnostics.some(d =>
      d.root_cause_type === 'protected_shell_import' && d.import_path === '@/components/BottomTabs',
    )).toBe(true);
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
