import { describe, expect, it } from 'vitest';
import {
  filterProductDeltaFiles,
  filterProductDeltaSpecs,
  getProductDeltaScope,
  isProductDeltaPath,
} from '../ProductDeltaContract';
import { buildSkeletonContractForCoder } from '../SkeletonContractForCoder';

describe('ProductDeltaContract', () => {
  it('uses only required + optional manifest slots as generation permission', () => {
    const scope = getProductDeltaScope('mobile-app');

    expect(scope.required).toEqual([
      'config/app.ts',
      'config/routes.ts',
      'config/navigation.ts',
      'data/types.ts',
      'data/seed.ts',
      'pages/Onboarding.tsx',
      'pages/Home.tsx',
      'pages/Detail.tsx',
      'pages/Create.tsx',
      'pages/Progress.tsx',
      'pages/Profile.tsx',
    ]);
    expect(scope.optional).toEqual([]);
    expect(scope.allowed).toEqual(scope.required);
    expect(isProductDeltaPath('mobile-app', 'src/pages/Home.tsx')).toBe(true);
    expect(isProductDeltaPath('mobile-app', 'src/components/CustomCard.tsx')).toBe(false);
    expect(isProductDeltaPath('mobile-app', 'src/App.tsx')).toBe(false);
  });

  it('rejects arbitrary new modules even when they are not protected skeleton files', () => {
    const result = filterProductDeltaFiles('mobile-app', {
      'src/pages/Home.tsx': 'export default function Home() { return null; }',
      'src/hooks/useHabits.ts': 'export const useHabits = () => [];',
      'components/HabitCard.tsx': 'export default function HabitCard() { return null; }',
      'src/App.tsx': 'export default function App() { return null; }',
    });

    expect(Object.keys(result.files)).toEqual(['pages/Home.tsx']);
    expect(result.rejected).toEqual([
      'App.tsx',
      'components/HabitCard.tsx',
      'hooks/useHabits.ts',
    ]);
  });

  it('canonicalizes src-prefixed architect/coder specs and keeps only product slots', () => {
    const result = filterProductDeltaSpecs('mobile-app', [
      { path: 'src/data/seed.ts', purpose: 'Domain seed' },
      { path: 'pages/Home.tsx', purpose: 'Main product screen' },
      { path: 'src/services/habits.ts', purpose: 'Invented service' },
    ]);

    expect(result.specs).toEqual([
      { path: 'data/seed.ts', purpose: 'Domain seed' },
      { path: 'pages/Home.tsx', purpose: 'Main product screen' },
    ]);
    expect(result.rejected).toEqual(['services/habits.ts']);
  });

  it('keeps optional slots writable without making them required', () => {
    const scope = getProductDeltaScope('saas-dashboard');
    expect(scope.optional).toContain('config/routes.ts');
    expect(scope.required).not.toContain('config/routes.ts');
    expect(scope.allowed).toContain('config/routes.ts');
  });

  it('makes writable navigation product slots authoritative over legacy read-only wording', () => {
    const contract = buildSkeletonContractForCoder('mobile-app');

    expect(contract).toContain('Product-slot exports — define these in src/config/navigation.ts');
    expect(contract).toContain('src/config/navigation.ts is writable product configuration');
    expect(contract).not.toContain('BOTTOM_TABS is read-only');
    expect(contract).toContain('Import BottomTabs from @/components/BottomTabs');
  });
});
