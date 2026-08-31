import { describe, expect, it } from 'vitest';
import { validateProtectedShellBoundary } from '../LiveGenerationContractValidator';

describe('LiveGenerationContract explicit infrastructure boundary', () => {
  it('allows a product page to consume reusable read-only hooks and context consumers', () => {
    const home = [
      "import { useLocalStorage } from '@/hooks/useLocalStorage';",
      "import { useAppContext } from '@/context/AppContext';",
      'export default function Home() {',
      "  const [value] = useLocalStorage('x', 'ok');",
      '  const ctx = useAppContext();',
      '  return <div>{value}{String(Boolean(ctx))}</div>;',
      '}',
    ].join('\n');

    const result = validateProtectedShellBoundary({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/main.tsx': 'export {};',
        'src/App.tsx': 'export default function App(){return null}',
        'src/hooks/useLocalStorage.ts': "export const useLocalStorage = () => ['ok'] as const;",
        'src/context/AppContext.tsx': 'export const useAppContext = () => ({});',
        'src/pages/Home.tsx': home,
      },
      generatedDeltaFiles: { 'src/pages/Home.tsx': home },
    });

    expect(result.diagnostics.filter(d => d.root_cause_type === 'protected_shell_import')).toEqual([]);
  });

  it('blocks provider ownership from a product page', () => {
    const home = [
      "import { AppProvider } from '@/context/AppContext';",
      'export default function Home() { return <AppProvider><div /></AppProvider>; }',
    ].join('\n');
    const result = validateProtectedShellBoundary({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/main.tsx': 'export {};',
        'src/App.tsx': 'export default function App(){return null}',
        'src/context/AppContext.tsx': 'export const AppProvider = ({ children }: any) => children;',
        'src/pages/Home.tsx': home,
      },
      generatedDeltaFiles: { 'src/pages/Home.tsx': home },
    });
    expect(result.diagnostics.some(d => d.root_cause_type === 'protected_shell_import')).toBe(true);
  });

  it('blocks router ownership APIs from a product page', () => {
    const home = [
      "import { Routes, Route } from 'react-router-dom';",
      'export default function Home() { return <Routes><Route path="/" element={null} /></Routes>; }',
    ].join('\n');
    const result = validateProtectedShellBoundary({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/main.tsx': 'export {};',
        'src/App.tsx': 'export default function App(){return null}',
        'src/pages/Home.tsx': home,
      },
      generatedDeltaFiles: { 'src/pages/Home.tsx': home },
    });
    expect(result.diagnostics.some(d => d.root_cause_type === 'protected_shell_import')).toBe(true);
  });

  it('blocks importing the root navigation owner but allows reusable read-only UI', () => {
    const detail = [
      "import BottomTabs from '@/components/BottomTabs';",
      "import EmptyState from '@/components/EmptyState';",
      'export default function Detail() { return <><EmptyState /><BottomTabs /></>; }',
    ].join('\n');
    const result = validateProtectedShellBoundary({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/main.tsx': 'export {};',
        'src/App.tsx': 'export default function App(){return null}',
        'src/components/BottomTabs.tsx': 'export default function BottomTabs(){return null}',
        'src/components/EmptyState.tsx': 'export default function EmptyState(){return null}',
        'src/pages/Detail.tsx': detail,
      },
      generatedDeltaFiles: { 'src/pages/Detail.tsx': detail },
    });
    const protectedImports = result.diagnostics
      .filter(d => d.root_cause_type === 'protected_shell_import')
      .map(d => d.import_path);
    expect(protectedImports).toContain('@/components/BottomTabs');
    expect(protectedImports).not.toContain('@/components/EmptyState');
  });

  it('does not inspect skeleton read-only files as product ownership when delta is unavailable', () => {
    const result = validateProtectedShellBoundary({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/main.tsx': 'export {};',
        'src/App.tsx': 'export default function App(){return null}',
        'src/components/EmptyState.tsx': "import { Routes } from 'react-router-dom'; export default function EmptyState(){return <Routes />}",
        'src/pages/Home.tsx': 'export default function Home(){return <div />}',
      },
    });
    expect(result.diagnostics.filter(d => d.root_cause_type === 'protected_shell_import')).toEqual([]);
  });
});
