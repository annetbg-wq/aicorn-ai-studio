// @vitest-environment node
/**
 * DanglingRelativeImports.test.ts
 *
 * Locks the pre-compile detector that finds relative local-module imports the
 * coder referenced but forgot to emit (missing_local_import). A complex run
 * (AI personal-finance copilot, 9 pages) hard-failed because src/hooks/useFinance.ts
 * imported '../types/finance' with no types/finance.ts in the output, and the
 * repair/quality passes — which only edit existing files — could not recover.
 */
import { describe, expect, it } from 'vitest';
import { collectDanglingRelativeImports } from '../ProtoPipeline';

describe('collectDanglingRelativeImports', () => {
  it('detects a relative import whose target module is absent, with the symbols used', () => {
    const files = {
      'src/hooks/useFinance.ts':
        "import { Account, Transaction } from '../types/finance';\nexport function useFinance(){ return null; }",
    };
    const out = collectDanglingRelativeImports(files);
    expect(out.has('src/types/finance')).toBe(true);
    const need = out.get('src/types/finance')!;
    expect(need.importers.has('src/hooks/useFinance.ts')).toBe(true);
    expect(need.namedImports.has('Account')).toBe(true);
    expect(need.namedImports.has('Transaction')).toBe(true);
  });

  it('captures default imports too', () => {
    const files = {
      'src/pages/Home.tsx': "import financeStore from '../store/finance';\nexport default function H(){return null;}",
    };
    const need = collectDanglingRelativeImports(files).get('src/store/finance');
    expect(need).toBeTruthy();
    expect(need!.defaultImports.has('financeStore')).toBe(true);
  });

  it('does NOT flag a relative import whose target exists (any extension / index)', () => {
    const files = {
      'src/hooks/useFinance.ts': "import { Account } from '../types/finance';",
      'src/types/finance.ts': 'export interface Account { id: string }',
      'src/hooks/useBudget.ts': "import { rules } from '../lib/rules';",
      'src/lib/rules/index.ts': 'export const rules = [];',
    };
    expect(collectDanglingRelativeImports(files).size).toBe(0);
  });

  it('ignores non-relative (@/ alias and bare package) imports — never flags skeleton modules', () => {
    const files = {
      'src/pages/Home.tsx':
        "import { Card } from '@/components/ui/card';\nimport { useApp } from '@/context/AppContext';\nimport { useState } from 'react';",
    };
    expect(collectDanglingRelativeImports(files).size).toBe(0);
  });

  it('ignores asset/style relative imports (Vite resolves them from disk)', () => {
    const files = {
      'src/pages/Home.tsx': "import hero from './hero.svg';\nimport './home.css';",
    };
    expect(collectDanglingRelativeImports(files).size).toBe(0);
  });

  it('merges multiple importers of the same missing module', () => {
    const files = {
      'src/hooks/useFinance.ts': "import { Account } from '../types/finance';",
      'src/pages/Accounts.tsx': "import { Transaction, Budget } from '../types/finance';",
    };
    const need = collectDanglingRelativeImports(files).get('src/types/finance')!;
    expect(need.importers.size).toBe(2);
    expect([...need.namedImports].sort()).toEqual(['Account', 'Budget', 'Transaction']);
  });
});
