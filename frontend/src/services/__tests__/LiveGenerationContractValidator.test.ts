import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  LIVE_GENERATION_ALLOWED_UI_PRIMITIVES,
  LIVE_GENERATION_UI_IMPORT_CATALOG,
  buildLiveGenerationUiPrimitiveImportCatalog,
  filterAdvertisedUiPrimitiveNames,
  validateImportExportContract,
  validateLiveGenerationContract,
  validateProtectedShellBoundary,
  validateUiPrimitiveCatalogAvailability,
} from '../LiveGenerationContractValidator';

function readWorkspaceFiles(root: string, current = root): string[] {
  const entries = fs.readdirSync(current, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      out.push(...readWorkspaceFiles(root, entryPath));
      continue;
    }
    out.push(path.relative(root, entryPath).replace(/\\/g, '/'));
  }
  return out;
}

function readCaseSensitivePathSegments(targetPath: string): boolean {
  const normalized = path.resolve(targetPath);
  const parsed = path.parse(normalized);
  const segments = normalized.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;

  for (const segment of segments) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    const entry = entries.find(item => item.name === segment);
    if (!entry) return false;
    current = path.join(current, entry.name);
  }

  return true;
}

function findUiBarrelPaths(root: string, current = root): string[] {
  const entries = fs.readdirSync(current, { withFileTypes: true });
  const out: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      out.push(...findUiBarrelPaths(root, entryPath));
      continue;
    }

    if (entry.name === 'index.ts' && entryPath.replace(/\\/g, '/').includes('/src/components/ui/')) {
      out.push(entryPath);
    }
  }

  return out.sort((left, right) => left.localeCompare(right));
}

describe('LiveGenerationContractValidator candidate graph', () => {
  it('passes when raw delta omits App.tsx but the skeleton final graph provides it', () => {
    const result = validateLiveGenerationContract({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/main.tsx': 'import App from "./App";',
        'src/App.tsx': 'export default function App() { return <main />; }',
        'src/route-manifest.json': '{"shell":"AppShell + BottomTabs"}',
        'src/pages/Home.tsx': 'export default function Home() { return <section>Home</section>; }',
        'src/components/BottomTabs.tsx': 'export function BottomTabs() { return null; }',
        'src/data/seed.ts': 'export const HABIT_SEED = [];',
        'src/data/types.ts': 'export interface Habit { id: string; }',
        'src/index.css': ':root {}',
      },
      generatedDeltaFiles: {
        'src/pages/Home.tsx': 'export default function Home() { return <section>Home</section>; }',
      },
    });

    expect(result.ok).toBe(true);
  });

  it('fails with a precise missing_entry_file diagnostic when App.tsx is truly absent', () => {
    const result = validateLiveGenerationContract({
      finalFiles: {
        'src/main.tsx': 'import App from "./App";',
        'src/pages/Home.tsx': 'export default function Home() { return <section>Home</section>; }',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some(d => d.root_cause_type === 'missing_entry_file' && d.file === 'src/App.tsx')).toBe(true);
  });

  it('does not false-fail thin output when a complete skeleton foundation backs one generated page', () => {
    const result = validateLiveGenerationContract({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/main.tsx': 'import App from "./App";',
        'src/App.tsx': 'export default function App() { return <Home />; }',
        'src/route-manifest.json': '{"shell":"AppShell + BottomTabs"}',
        'src/pages/Home.tsx': 'export default function Home() { return <section>Thin but valid</section>; }',
        'src/components/BottomTabs.tsx': 'export function BottomTabs() { return null; }',
        'src/context/AppContext.tsx': 'export function AppProvider({ children }: { children: React.ReactNode }) { return children; }',
        'src/data/seed.ts': 'export const HABIT_SEED = [];',
        'src/data/types.ts': 'export interface Habit { id: string; streak: number; }',
        'src/index.css': ':root {}',
      },
      generatedDeltaFiles: {
        'src/pages/Home.tsx': 'export default function Home() { return <section>Thin but valid</section>; }',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics.some(d => d.root_cause_type === 'thin_output')).toBe(false);
  });

  it('fails when no root shell owner exists anywhere in the candidate graph', () => {
    const result = validateLiveGenerationContract({
      finalFiles: {
        'src/main.tsx': 'import App from "./App";',
        'src/pages/Home.tsx': 'export default function Home() { return <section>Home</section>; }',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some(d => d.root_cause_type === 'missing_root_shell')).toBe(true);
  });

  it('fails when a skeleton-required src/data/seed.ts is missing from the final candidate graph', () => {
    const result = validateLiveGenerationContract({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/main.tsx': 'import App from "./App";',
        'src/App.tsx': 'export default function App() { return <main />; }',
        'src/route-manifest.json': '{"shell":"AppShell + BottomTabs"}',
        'src/pages/Home.tsx': 'export default function Home() { return <section>Home</section>; }',
        'src/data/types.ts': 'export interface Habit { id: string; }',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      root_cause_type: 'missing_required_manifest_file',
      file: 'src/data/seed.ts',
    }));
  });

  it('fails when a skeleton-required src/data/types.ts is missing from the final candidate graph', () => {
    const result = validateLiveGenerationContract({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/main.tsx': 'import App from "./App";',
        'src/App.tsx': 'export default function App() { return <main />; }',
        'src/route-manifest.json': '{"shell":"AppShell + BottomTabs"}',
        'src/pages/Home.tsx': 'export default function Home() { return <section>Home</section>; }',
        'src/data/seed.ts': 'export const HABIT_SEED = [];',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      root_cause_type: 'missing_required_manifest_file',
      file: 'src/data/types.ts',
    }));
  });

  it('passes when skeleton-required data-layer files survive in the final candidate graph', () => {
    const result = validateLiveGenerationContract({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/main.tsx': 'import App from "./App";',
        'src/App.tsx': 'export default function App() { return <main />; }',
        'src/route-manifest.json': '{"shell":"AppShell + BottomTabs"}',
        'src/pages/Home.tsx': 'export default function Home() { return <section>Home</section>; }',
        'src/data/seed.ts': 'export const HABIT_SEED = [];',
        'src/data/types.ts': 'export interface Habit { id: string; }',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics.some(d => d.root_cause_type === 'missing_required_manifest_file')).toBe(false);
  });
});

describe('LiveGenerationContractValidator import/export contract', () => {
  it('does not flag asset imports (svg/png) as missing local modules — Vite resolves them from disk', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/pages/Detail.tsx': [
          "import illustration from '@/assets/generated/mobile-onboarding-onboarding-illustration.svg';",
          "import logo from '@/assets/brand/logo.png';",
          'export default function Detail() { return <img src={illustration} alt="" />; }',
        ].join('\n'),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('fails missing accordion before Vite with a missing_ui_primitive diagnostic', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/App.tsx': [
          "import { Accordion } from '@/components/ui/accordion';",
          'export default function App() { return <Accordion />; }',
        ].join('\n'),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.root_cause_type).toBe('missing_ui_primitive');
  });

  it('fails missing scroll-area before Vite with a missing_ui_primitive diagnostic', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/App.tsx': [
          "import { ScrollArea } from '@/components/ui/scroll-area';",
          'export default function App() { return <ScrollArea />; }',
        ].join('\n'),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.root_cause_type).toBe('missing_ui_primitive');
  });

  it('detects invalid default import from a named-only local hook before Vite', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/hooks/useSymptoms.ts': [
          "import useLocalStorage from '@/hooks/useLocalStorage';",
          'export function useSymptoms() { return useLocalStorage; }',
        ].join('\n'),
        'src/hooks/useLocalStorage.ts': 'export function useLocalStorage() {}',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({
      root_cause_type: 'invalid_default_import',
      file: 'src/hooks/useSymptoms.ts',
      import_path: '@/hooks/useLocalStorage',
      expected: 'default export',
      actual: 'named exports only',
      suggested_fix: 'Use named import { useLocalStorage } or add a safe default export to the canonical hook.',
    });
  });

  it('accepts a named import from useLocalStorage', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/hooks/useSymptoms.ts': [
          "import { useLocalStorage } from '@/hooks/useLocalStorage';",
          'export function useSymptoms() { return useLocalStorage; }',
        ].join('\n'),
        'src/hooks/useLocalStorage.ts': 'export function useLocalStorage() {}',
      },
    });

    expect(result.ok).toBe(true);
  });

  it('detects missing local imports outside components/ui', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/hooks/useSymptoms.ts': [
          "import { symptomSeed } from '@/data/symptomSeed';",
          'export function useSymptoms() { return symptomSeed; }',
        ].join('\n'),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({
      root_cause_type: 'missing_local_import',
      file: 'src/hooks/useSymptoms.ts',
      import_path: '@/data/symptomSeed',
    });
  });

  it('fails hook imports from @/data/seed before Vite when the canonical seed file is missing', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/hooks/useCart.ts': [
          "import { SEED_PRODUCTS } from '@/data/seed';",
          'export function useCart() { return SEED_PRODUCTS; }',
        ].join('\n'),
      },
      requiredLocalFiles: ['src/data/seed.ts', 'src/data/types.ts'],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      root_cause_type: 'missing_local_import',
      file: 'src/hooks/useCart.ts',
      import_path: '@/data/seed',
      actual: 'missing target module src/data/seed',
    }));
  });

  it('passes hook imports from @/data/seed when the canonical data layer exists', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/hooks/useCart.ts': [
          "import { SEED_PRODUCTS } from '@/data/seed';",
          'export function useCart() { return SEED_PRODUCTS; }',
        ].join('\n'),
        'src/data/seed.ts': 'export const SEED_PRODUCTS = [];',
        'src/data/types.ts': 'export interface Product { id: string; }',
      },
      requiredLocalFiles: ['src/data/seed.ts', 'src/data/types.ts'],
    });

    expect(result.ok).toBe(true);
  });

  it('detects missing named exports from local hook data and config modules', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/hooks/useSymptoms.ts': [
          "import { symptomSeed } from '@/data/symptoms';",
          "import { STORAGE_KEYS } from '@/config/app';",
          'export function useSymptoms() { return [symptomSeed, STORAGE_KEYS]; }',
        ].join('\n'),
        'src/data/symptoms.ts': 'export const symptoms = [];',
        'src/config/app.ts': 'export const APP_CONFIG = { name: "Demo" };',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.filter(d => d.root_cause_type === 'missing_named_export')).toHaveLength(2);
    expect(result.diagnostics.some(d => d.import_path === '@/data/symptoms' && d.expected === 'named export symptomSeed')).toBe(true);
    expect(result.diagnostics.some(d => d.import_path === '@/config/app' && d.expected === 'named export STORAGE_KEYS')).toBe(true);
  });

  it('validates context lib and utils alias contracts', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/pages/Home.tsx': [
          "import { useApp } from '@/context/AppContext';",
          "import { cn } from '@/lib/cn';",
          "import { formatCount } from '@/utils/formatCount';",
          'export default function Home() { return String([useApp, cn, formatCount]); }',
        ].join('\n'),
        'src/context/AppContext.tsx': 'export function AppProvider() { return null; }',
        'src/lib/cn.ts': 'export function cx() { return ""; }',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some(d => d.root_cause_type === 'missing_named_export' && d.import_path === '@/context/AppContext')).toBe(true);
    expect(result.diagnostics.some(d => d.root_cause_type === 'missing_named_export' && d.import_path === '@/lib/cn')).toBe(true);
    expect(result.diagnostics.some(d => d.root_cause_type === 'missing_local_import' && d.import_path === '@/utils/formatCount')).toBe(true);
  });

  it('accepts local component imports', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/pages/Home.tsx': [
          "import { HabitCard } from '@/components/HabitCard';",
          'export default function Home() { return <HabitCard />; }',
        ].join('\n'),
        'src/components/HabitCard.tsx': 'export function HabitCard() { return null; }',
      },
    });

    expect(result.ok).toBe(true);
  });

  it('ignores type-only local imports during runtime contract validation', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/pages/Home.tsx': [
          "import type { MissingType } from '@/data/missingTypes';",
          "import { type AlsoMissing } from '@/data/missingTypes';",
          'export default function Home() { return null; }',
        ].join('\n'),
      },
    });

    expect(result.ok).toBe(true);
  });

  it('fails invalid default imports when the target only has named exports', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/pages/Create.tsx': [
          "import BottomTabs from '@/components/BottomTabs';",
          'export default function Create() { return <BottomTabs />; }',
        ].join('\n'),
        'src/components/BottomTabs.tsx': 'export function BottomTabs() { return null; }',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some(d => d.root_cause_type === 'invalid_default_import')).toBe(true);
  });

  it('fails when a named export is missing from the target module', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/App.tsx': [
          "import { HomeCard } from './components/cards';",
          'export default function App() { return <HomeCard />; }',
        ].join('\n'),
        'src/components/cards/index.ts': 'export { DashboardCard } from "./DashboardCard";',
        'src/components/cards/DashboardCard.tsx': 'export function DashboardCard() { return null; }',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some(d => d.root_cause_type === 'missing_named_export')).toBe(true);
  });

  it('passes valid UI primitive imports when the target file exists and exports correctly', () => {
    const result = validateImportExportContract({
      finalFiles: {
        'src/App.tsx': [
          "import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';",
          'export default function App() { return <ScrollArea><ScrollBar /></ScrollArea>; }',
        ].join('\n'),
        'src/components/ui/scroll-area.tsx': [
          'export function ScrollArea() { return null; }',
          'export function ScrollBar() { return null; }',
        ].join('\n'),
      },
    });

    expect(result.ok).toBe(true);
  });
});

describe('LiveGenerationContractValidator protected shell boundaries', () => {
  it('fails when a page imports BottomTabs directly', () => {
    const result = validateProtectedShellBoundary({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/pages/Create.tsx': [
          "import { BottomTabs } from '@/components/BottomTabs';",
          'export default function Create() { return <BottomTabs />; }',
        ].join('\n'),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.root_cause_type).toBe('protected_shell_import');
  });

  it('passes when App.tsx imports BottomTabs', () => {
    const result = validateProtectedShellBoundary({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/App.tsx': [
          "import { BottomTabs } from '@/components/BottomTabs';",
          'export default function App() { return <BottomTabs />; }',
        ].join('\n'),
      },
    });

    expect(result.ok).toBe(true);
  });

  it('passes when a page imports a normal UI component', () => {
    const result = validateProtectedShellBoundary({
      skeletonId: 'mobile-app',
      finalFiles: {
        'src/pages/Home.tsx': [
          "import { Button } from '@/components/ui/Button';",
          'export default function Home() { return <Button />; }',
        ].join('\n'),
      },
    });

    expect(result.ok).toBe(true);
  });
});

describe('LiveGenerationContractValidator UI primitive catalog contract', () => {
  it('builds a truthful import catalog for allowed primitives only', () => {
    const catalog = buildLiveGenerationUiPrimitiveImportCatalog(['Button', 'ScrollArea', 'Tooltip']);

    expect(catalog).toContain("Button from '@/components/ui/button'");
    expect(catalog).toContain("ScrollArea, ScrollBar from '@/components/ui/scroll-area'");
    expect(catalog).toContain("Tooltip, TooltipContent, TooltipProvider, TooltipTrigger from '@/components/ui/tooltip'");
    expect(filterAdvertisedUiPrimitiveNames(['Button', 'Nope'])).toEqual(['Button']);
  });

  it('fails if an advertised primitive has no physical canonical source', () => {
    const diagnostics = validateUiPrimitiveCatalogAvailability({
      advertisedPrimitives: ['Button', 'ImaginaryPrimitive'],
      workspaceFiles: ['frontend/src/components/ui/button.tsx'],
    });

    expect(diagnostics.some(d => d.import_path === 'ImaginaryPrimitive')).toBe(true);
  });

  it('keeps every required advertised primitive backed by a physical canonical source', () => {
    const root = path.resolve(__dirname, '..', '..', '..', '..');
    const workspaceFiles = [
      ...readWorkspaceFiles(path.join(root, 'frontend', 'src', 'components', 'ui')).map(file => `frontend/src/components/ui/${file}`),
      ...readWorkspaceFiles(path.join(root, 'skeletons')).map(file => `skeletons/${file}`),
    ];

    const diagnostics = validateUiPrimitiveCatalogAvailability({
      advertisedPrimitives: LIVE_GENERATION_ALLOWED_UI_PRIMITIVES,
      workspaceFiles,
    });

    expect(diagnostics).toEqual([]);
  });

  it('keeps the avatar primitive backed by a canonical skeleton source', () => {
    const diagnostics = validateUiPrimitiveCatalogAvailability({
      advertisedPrimitives: ['Avatar'],
      workspaceFiles: ['skeletons/mobile-app/skeleton-mobile-app/src/components/ui/Avatar.tsx'],
    });

    expect(diagnostics).toEqual([]);
  });

  it('keeps the alert-dialog primitive backed by a canonical skeleton source', () => {
    const diagnostics = validateUiPrimitiveCatalogAvailability({
      advertisedPrimitives: ['AlertDialog'],
      workspaceFiles: ['skeletons/mobile-app/skeleton-mobile-app/src/components/ui/alert-dialog.tsx'],
    });

    expect(diagnostics).toEqual([]);
  });

  it('keeps the sheet primitive backed by a canonical skeleton source', () => {
    const diagnostics = validateUiPrimitiveCatalogAvailability({
      advertisedPrimitives: ['Sheet'],
      workspaceFiles: ['skeletons/mobile-app/skeleton-mobile-app/src/components/ui/Sheet.tsx'],
    });

    expect(diagnostics).toEqual([]);
  });

  it('keeps every skeleton UI barrel export backed by a case-correct physical file', () => {
    const root = path.resolve(__dirname, '..', '..', '..', '..');
    const barrelPaths = findUiBarrelPaths(path.join(root, 'skeletons'));

    expect(barrelPaths.length).toBeGreaterThan(0);

    for (const barrelPath of barrelPaths) {
      const content = fs.readFileSync(barrelPath, 'utf-8');
      const uiRoot = path.dirname(barrelPath);
      const exportedModules = Array.from(content.matchAll(/export\s+\*\s+from\s+['"]\.\/([^'"]+)['"]/g)).map(match => match[1]);

      for (const exportedModule of exportedModules) {
        const hasBackingFile = [
          path.join(uiRoot, `${exportedModule}.ts`),
          path.join(uiRoot, `${exportedModule}.tsx`),
          path.join(uiRoot, exportedModule, 'index.ts'),
          path.join(uiRoot, exportedModule, 'index.tsx'),
        ].some(candidate => readCaseSensitivePathSegments(candidate));

        expect(hasBackingFile, `${path.relative(root, barrelPath).replace(/\\/g, '/')} -> ${exportedModule}`).toBe(true);
      }
    }
  });

  it('keeps the prompt-side catalog aligned with the canonical contract list', () => {
    const advertisedKeys = Object.keys(LIVE_GENERATION_UI_IMPORT_CATALOG).sort();

    expect(advertisedKeys).toEqual([
      'Accordion',
      'Alert',
      'AlertDialog',
      'Avatar',
      'Badge',
      'Button',
      'Card',
      'Dialog',
      'DropdownMenu',
      'Input',
      'Label',
      'Progress',
      'ScrollArea',
      'Select',
      'Separator',
      'Sheet',
      'Skeleton',
      'Switch',
      'Tabs',
      'Textarea',
      'Tooltip',
    ]);
  });
});
