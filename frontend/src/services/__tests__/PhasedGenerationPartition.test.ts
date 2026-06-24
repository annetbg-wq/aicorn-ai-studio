// @vitest-environment node
/**
 * PhasedGenerationPartition.test.ts
 *
 * Locks the foundation/screen split that drives phased generation: the data/logic
 * foundation (types, data, hooks, services, store) is generated first, then the UI
 * screens against that fixed contract — removing the cross-module drift and
 * dangling-import failures a single big-bang pass is prone to on complex apps.
 */
import { describe, expect, it } from 'vitest';
import { partitionDeltaForPhasing } from '../ProtoPipeline';

const f = (path: string) => ({ path, purpose: '' });

describe('partitionDeltaForPhasing', () => {
  it('routes data/types/hooks/services/store to the foundation', () => {
    const { foundation, screens } = partitionDeltaForPhasing([
      f('src/data/types.ts'),
      f('src/data/seed.ts'),
      f('src/hooks/useFinance.ts'),
      f('src/services/financeApi.ts'),
      f('src/store/financeStore.ts'),
      f('src/lib/format.ts'),
    ]);
    expect(foundation.map(x => x.path)).toEqual([
      'src/data/types.ts', 'src/data/seed.ts', 'src/hooks/useFinance.ts',
      'src/services/financeApi.ts', 'src/store/financeStore.ts', 'src/lib/format.ts',
    ]);
    expect(screens).toHaveLength(0);
  });

  it('routes pages/components/sections to the screens', () => {
    const { foundation, screens } = partitionDeltaForPhasing([
      f('src/pages/Home.tsx'),
      f('src/pages/Budgets.tsx'),
      f('src/components/StatCard.tsx'),
      f('src/components/sections/Hero.tsx'),
    ]);
    expect(screens).toHaveLength(4);
    expect(foundation).toHaveLength(0);
  });

  it('splits a realistic complex app correctly', () => {
    const { foundation, screens } = partitionDeltaForPhasing([
      f('src/data/types.ts'),
      f('src/hooks/useTransactions.ts'),
      f('src/pages/Home.tsx'),
      f('src/pages/Transactions.tsx'),
      f('src/pages/Budgets.tsx'),
      f('src/components/PaywallSheet.tsx'),
    ]);
    expect(foundation.map(x => x.path)).toEqual(['src/data/types.ts', 'src/hooks/useTransactions.ts']);
    expect(screens.map(x => x.path)).toEqual([
      'src/pages/Home.tsx', 'src/pages/Transactions.tsx', 'src/pages/Budgets.tsx', 'src/components/PaywallSheet.tsx',
    ]);
  });

  it('treats a bare types.ts / data.ts file (no dir) as foundation', () => {
    const { foundation } = partitionDeltaForPhasing([f('src/types.ts'), f('src/data.ts'), f('src/constants.ts')]);
    expect(foundation).toHaveLength(3);
  });
});
