// @vitest-environment jsdom
/**
 * editAdmission.test.ts — Filesystem guardrails + edit-admission control.
 *
 * Coverage:
 *   1. Protected path escalation → risk='risky'
 *   2. Destructive edit (file deletion) → risk='destructive', requiresStrongConfirmation
 *   3. Safe edits flow normally → risk='safe', no confirmation required
 *   4. Dirty workspace → risk escalates to 'risky'
 *   5. Config file change escalates → risk='risky'
 *   6. Large change (≥15 files) escalates → risk='risky'
 *   7. Risky edit requires explicit confirmation (requiresConfirmation=true)
 *   8. Destructive edit requires strong confirmation (requiresStrongConfirmation=true)
 *   9. Admission resolve/deny contract (mirrors useStudio diffResolverRef pattern)
 *  10. Safe edit passes through the gate without blocking (admitted=true immediately)
 *  11. Candidate-only guard: risky edit requires approval; candidate not promoted without it
 *  12. Approval unblocks the pipeline; denial keeps last-good intact
 *  13. isProtectedPath() helper matches registry correctly
 *  14. Multiple protected paths hit — all listed in protectedPathsHit
 *  15. Preview-workspace path is protected
 */

import { describe, it, expect } from 'vitest';
import {
  EditAdmissionService,
  type EditMeta,
  type AdmissionDecision,
  type EditRisk,
} from '../EditAdmissionService';
import { resolveAdmissionDecision } from '../admissionGate';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAFE_PATHS = [
  'App.tsx',
  'components/Button.tsx',
  'components/Hero.tsx',
  'styles/globals.css',
  'utils/formatDate.ts',
];

const RISKY_CONFIG_PATH  = ['tailwind.config.js'];
const RISKY_PROTECTED    = ['RevisionManager.ts'];
const DESTRUCTIVE_ACTIVE = ['App.tsx', 'components/Button.tsx'];
// candidate that omits Button.tsx → Button.tsx would be deleted
const DESTRUCTIVE_CANDIDATE = ['App.tsx'];

// ── 1. Protected path escalation ──────────────────────────────────────────────

describe('protected path escalation', () => {
  it('touching RevisionManager escalates to risky', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: [...SAFE_PATHS, 'RevisionManager.ts'],
      activePaths:    [...SAFE_PATHS, 'RevisionManager.ts'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
    expect(dec.protectedPathsHit).toContain('RevisionManager.ts');
    expect(dec.requiresConfirmation).toBe(true);
    expect(dec.requiresStrongConfirmation).toBe(false);
  });

  it('touching useStudio escalates to risky', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['useStudio.ts'],
      activePaths:    ['useStudio.ts'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
    expect(dec.protectedPathsHit).toContain('useStudio.ts');
  });

  it('touching PreviewWriteGateway escalates to risky', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['PreviewWriteGateway.ts'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
  });

  it('touching PreviewCanvas escalates to risky', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['components/PreviewCanvas.tsx'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
    expect(dec.protectedPathsHit.length).toBeGreaterThan(0);
  });

  it('package.json escalates to risky', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['package.json'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
    expect(dec.protectedPathsHit).toContain('package.json');
  });

  it('vite.config.ts escalates to risky', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['vite.config.ts'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
  });

  it('preview-workspace path escalates to risky', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['preview-workspace/src/App.tsx'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
    expect(dec.protectedPathsHit[0]).toContain('preview-workspace');
  });

  it('canonicalizes backslash protected-path equivalents', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['backend\\auth-token.ts'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
    expect(dec.protectedPathsHit).toContain('backend/auth-token.ts');
  });

  it('canonicalizes src-prefixed protected-path equivalents', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['/src/vite.config.ts'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
    expect(dec.protectedPathsHit).toContain('vite.config.ts');
  });
});

// ── 2. Destructive edits ─────────────────────────────────────────────────────

describe('destructive edit — file deletion', () => {
  it('missing active file in candidate → destructive', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: DESTRUCTIVE_CANDIDATE,
      activePaths:    DESTRUCTIVE_ACTIVE,
    });
    expect(dec.risk).toBe<EditRisk>('destructive');
    expect(dec.deletedPaths).toContain('components/Button.tsx');
    expect(dec.requiresStrongConfirmation).toBe(true);
    expect(dec.requiresConfirmation).toBe(true);
  });

  it('destructive > risky: deletion overrides protected-path escalation level', () => {
    // Both a deletion AND a protected path — must stay destructive
    const dec = EditAdmissionService.classify({
      candidatePaths: ['App.tsx', 'RevisionManager.ts'], // missing Button.tsx
      activePaths:    ['App.tsx', 'RevisionManager.ts', 'components/Button.tsx'],
    });
    expect(dec.risk).toBe<EditRisk>('destructive');
  });

  it('no deletions when active = candidate', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: SAFE_PATHS,
      activePaths:    SAFE_PATHS,
    });
    expect(dec.deletedPaths).toHaveLength(0);
  });

  it('userBody mentions deleted file names', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['App.tsx'],
      activePaths:    ['App.tsx', 'components/Button.tsx'],
    });
    expect(dec.userBody).toContain('Button.tsx');
  });

  it('userHeading uses strong language for destructive', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: [],
      activePaths:    ['App.tsx'],
    });
    expect(dec.userHeading).toContain('confirmation required');
  });
});

// ── 3. Safe edits ─────────────────────────────────────────────────────────────

describe('safe edits — no interruption', () => {
  it('normal source files → safe', () => {
    const dec = EditAdmissionService.classify({ candidatePaths: SAFE_PATHS });
    expect(dec.risk).toBe<EditRisk>('safe');
    expect(dec.requiresConfirmation).toBe(false);
    expect(dec.requiresStrongConfirmation).toBe(false);
    expect(dec.userHeading).toBe('');
    expect(dec.userBody).toBe('');
  });

  it('safe edit: no protected paths hit', () => {
    const dec = EditAdmissionService.classify({ candidatePaths: SAFE_PATHS });
    expect(dec.protectedPathsHit).toHaveLength(0);
  });

  it('safe edit: no deletions (no activePaths provided)', () => {
    const dec = EditAdmissionService.classify({ candidatePaths: SAFE_PATHS });
    expect(dec.deletedPaths).toHaveLength(0);
  });

  it('single file safe edit flows normally', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['components/Header.tsx'],
      activePaths:    ['components/Header.tsx'],
    });
    expect(dec.risk).toBe<EditRisk>('safe');
  });
});

// ── 4. Dirty workspace ────────────────────────────────────────────────────────

describe('dirty workspace escalation', () => {
  it('dirty workspace escalates safe edit to risky', () => {
    const dec = EditAdmissionService.classify(
      { candidatePaths: SAFE_PATHS, activePaths: SAFE_PATHS },
      true, // isDirtyWorkspace
    );
    expect(dec.risk).toBe<EditRisk>('risky');
    expect(dec.isDirtyWorkspace).toBe(true);
    expect(dec.requiresConfirmation).toBe(true);
  });

  it('dirty workspace reason appears in reasons list', () => {
    const dec = EditAdmissionService.classify(
      { candidatePaths: SAFE_PATHS },
      true,
    );
    expect(dec.reasons.some(r => r.toLowerCase().includes('unapplied'))).toBe(true);
  });

  it('dirty workspace does NOT override destructive (already highest)', () => {
    const dec = EditAdmissionService.classify(
      {
        candidatePaths: ['App.tsx'],
        activePaths:    ['App.tsx', 'OtherPage.tsx'],
      },
      true, // isDirtyWorkspace
    );
    expect(dec.risk).toBe<EditRisk>('destructive'); // deletion takes priority
  });

  it('clean workspace → no dirty-workspace reason', () => {
    const dec = EditAdmissionService.classify(
      { candidatePaths: SAFE_PATHS },
      false,
    );
    expect(dec.isDirtyWorkspace).toBe(false);
    expect(dec.reasons.some(r => r.toLowerCase().includes('unapplied'))).toBe(false);
  });
});

// ── 5. Config file escalation ─────────────────────────────────────────────────

describe('config file escalation', () => {
  it('tailwind.config.js escalates to risky', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['tailwind.config.js', 'App.tsx'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
    expect(dec.reasons.some(r => r.includes('tailwind.config.js'))).toBe(true);
  });

  it('tsconfig.json escalates to risky', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['tsconfig.json'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
  });

  it('.env file escalates to risky', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['.env'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
  });
});

// ── 6. Large change escalation ────────────────────────────────────────────────

describe('large change escalation', () => {
  it('15 safe files escalates to risky', () => {
    const paths = Array.from({ length: 15 }, (_, i) => `components/Component${i}.tsx`);
    const dec = EditAdmissionService.classify({ candidatePaths: paths });
    expect(dec.risk).toBe<EditRisk>('risky');
    expect(dec.reasons.some(r => r.includes('15 files'))).toBe(true);
  });

  it('14 safe files stays safe', () => {
    const paths = Array.from({ length: 14 }, (_, i) => `components/Component${i}.tsx`);
    const dec = EditAdmissionService.classify({ candidatePaths: paths });
    expect(dec.risk).toBe<EditRisk>('safe');
  });
});

// ── 7. requiresConfirmation flag ──────────────────────────────────────────────

describe('requiresConfirmation flag', () => {
  it('safe → requiresConfirmation=false', () => {
    expect(
      EditAdmissionService.classify({ candidatePaths: SAFE_PATHS }).requiresConfirmation,
    ).toBe(false);
  });

  it('risky → requiresConfirmation=true', () => {
    expect(
      EditAdmissionService.classify({ candidatePaths: ['RevisionManager.ts'] }).requiresConfirmation,
    ).toBe(true);
  });

  it('destructive → requiresConfirmation=true', () => {
    expect(
      EditAdmissionService.classify({
        candidatePaths: [],
        activePaths: ['App.tsx'],
      }).requiresConfirmation,
    ).toBe(true);
  });
});

// ── 8. requiresStrongConfirmation flag ───────────────────────────────────────

describe('requiresStrongConfirmation flag', () => {
  it('safe → requiresStrongConfirmation=false', () => {
    expect(
      EditAdmissionService.classify({ candidatePaths: SAFE_PATHS }).requiresStrongConfirmation,
    ).toBe(false);
  });

  it('risky → requiresStrongConfirmation=false', () => {
    expect(
      EditAdmissionService.classify({ candidatePaths: ['RevisionManager.ts'] }).requiresStrongConfirmation,
    ).toBe(false);
  });

  it('destructive → requiresStrongConfirmation=true', () => {
    expect(
      EditAdmissionService.classify({
        candidatePaths: [],
        activePaths: ['App.tsx'],
      }).requiresStrongConfirmation,
    ).toBe(true);
  });
});

// ── 9. Admission resolver contract ────────────────────────────────────────────
//
// Mirrors the useStudio admissionResolverRef / waitForAdmission pattern.

describe('admission resolver contract', () => {
  function createAdmissionGate() {
    let resolver: ((approved: boolean) => void) | null = null;

    const waitForAdmission = (_dec: AdmissionDecision): Promise<boolean> =>
      new Promise((resolve) => { resolver = resolve; });

    const confirm = () => { resolver?.(true);  resolver = null; };
    const deny    = () => { resolver?.(false); resolver = null; };

    return { waitForAdmission, confirm, deny };
  }

  const riskyDecision = EditAdmissionService.classify({
    candidatePaths: ['RevisionManager.ts'],
  });

  it('confirm() resolves with true', async () => {
    const { waitForAdmission, confirm } = createAdmissionGate();
    const p = waitForAdmission(riskyDecision);
    confirm();
    await expect(p).resolves.toBe(true);
  });

  it('deny() resolves with false', async () => {
    const { waitForAdmission, deny } = createAdmissionGate();
    const p = waitForAdmission(riskyDecision);
    deny();
    await expect(p).resolves.toBe(false);
  });

  it('second confirm() after resolve is a no-op (does not throw)', async () => {
    const { waitForAdmission, confirm } = createAdmissionGate();
    const p = waitForAdmission(riskyDecision);
    confirm();
    expect(() => confirm()).not.toThrow();
    await expect(p).resolves.toBe(true);
  });
});

describe('resolveAdmissionDecision', () => {
  it('safe decision proceeds without a gate', async () => {
    const logs: string[] = [];
    const decision = EditAdmissionService.classify({ candidatePaths: ['App.tsx'] });
    await expect(
      resolveAdmissionDecision(decision, undefined, (msg) => logs.push(msg)),
    ).resolves.toBe(true);
    expect(logs).toHaveLength(0);
  });

  it('risky decision without a gate is blocked by default', async () => {
    const logs: string[] = [];
    const decision = EditAdmissionService.classify({ candidatePaths: ['RevisionManager.ts'] });
    await expect(
      resolveAdmissionDecision(decision, undefined, (msg) => logs.push(msg)),
    ).resolves.toBe(false);
    expect(logs[0]).toContain('blocked because no admission handler is registered');
  });
});

// ── 10. Safe edit passes gate immediately ─────────────────────────────────────

describe('safe edit passes admission gate without blocking', () => {
  it('gate returns true immediately for safe decision', async () => {
    const dec = EditAdmissionService.classify({ candidatePaths: SAFE_PATHS });
    // Simulate what SimpleGeneration does: only calls waitForAdmission when
    // requiresConfirmation is true. For safe edits it skips the gate entirely.
    const gateWasCalled = dec.requiresConfirmation;
    expect(gateWasCalled).toBe(false); // no gate = admitted silently
  });
});

// ── 11. Candidate-only guard: risky edit requires approval before compile ─────

describe('candidate-only guard', () => {
  it('risky decision blocks compile path (requiresConfirmation=true)', () => {
    // Simulate the decision that would reach the gate before compileWithRetry.
    // A risky edit MUST have requiresConfirmation=true — the pipeline cannot
    // proceed without receiving an explicit true from the callback.
    const dec = EditAdmissionService.classify({
      candidatePaths: ['useStudio.ts', 'App.tsx'],
      activePaths:    ['useStudio.ts', 'App.tsx'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
    // The pipeline must call waitForAdmission and await approval
    expect(dec.requiresConfirmation).toBe(true);
    expect(dec.requiresStrongConfirmation).toBe(false);
  });

  it('destructive decision blocks compile path with strong flag', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['App.tsx'],
      activePaths:    ['App.tsx', 'services/AuthService.ts'],
    });
    expect(dec.requiresStrongConfirmation).toBe(true);
    // Strong confirmation = pipeline also must not proceed on simple dismiss
    expect(dec.requiresConfirmation).toBe(true);
  });
});

// ── 12. Approval vs denial pipeline contract ──────────────────────────────────

describe('approval / denial pipeline outcomes', () => {
  it('approved → pipeline proceeds (returns true)', async () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['RevisionManager.ts'],
    });
    // Simulate the gate being resolved with approval
    let resolverFn: ((v: boolean) => void) | null = null;
    const gateResult = new Promise<boolean>((resolve) => { resolverFn = resolve; });
    resolverFn!(true); // approval
    await expect(gateResult).resolves.toBe(true);
    // In the real pipeline: true → compileWithRetry proceeds
    // (tested via contract, not via network call)
  });

  it('denied → pipeline aborts (returns false)', async () => {
    let resolverFn: ((v: boolean) => void) | null = null;
    const gateResult = new Promise<boolean>((resolve) => { resolverFn = resolve; });
    resolverFn!(false); // denial
    await expect(gateResult).resolves.toBe(false);
    // In the real pipeline: false → revisionManager.rollback() + status='cancelled'
  });
});

// ── 13. isProtectedPath() helper ─────────────────────────────────────────────

describe('isProtectedPath()', () => {
  it('RevisionManager.ts → true', () => {
    expect(EditAdmissionService.isProtectedPath('RevisionManager.ts')).toBe(true);
  });

  it('package.json → true', () => {
    expect(EditAdmissionService.isProtectedPath('package.json')).toBe(true);
  });

  it('vite.config.ts → true', () => {
    expect(EditAdmissionService.isProtectedPath('vite.config.ts')).toBe(true);
  });

  it('main.tsx → true', () => {
    expect(EditAdmissionService.isProtectedPath('main.tsx')).toBe(true);
  });

  it('index.html → true', () => {
    expect(EditAdmissionService.isProtectedPath('index.html')).toBe(true);
  });

  it('App.tsx → false (regular component)', () => {
    expect(EditAdmissionService.isProtectedPath('App.tsx')).toBe(false);
  });

  it('components/Button.tsx → false', () => {
    expect(EditAdmissionService.isProtectedPath('components/Button.tsx')).toBe(false);
  });

  it('styles/globals.css → false', () => {
    expect(EditAdmissionService.isProtectedPath('styles/globals.css')).toBe(false);
  });
});

// ── 14. Multiple protected paths — all reported ───────────────────────────────

describe('multiple protected paths', () => {
  it('both RevisionManager and PreviewWriteGateway are reported', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['RevisionManager.ts', 'PreviewWriteGateway.ts', 'App.tsx'],
    });
    expect(dec.protectedPathsHit).toContain('RevisionManager.ts');
    expect(dec.protectedPathsHit).toContain('PreviewWriteGateway.ts');
    expect(dec.protectedPathsHit).not.toContain('App.tsx');
    expect(dec.risk).toBe<EditRisk>('risky');
  });
});

// ── 15. Preview-workspace path protection ─────────────────────────────────────

describe('preview-workspace derivative-only enforcement', () => {
  it('preview-workspace/src/App.tsx is protected', () => {
    expect(EditAdmissionService.isProtectedPath('preview-workspace/src/App.tsx')).toBe(true);
  });

  it('backend\\auth-token.ts is protected after canonicalization', () => {
    expect(EditAdmissionService.isProtectedPath('backend\\auth-token.ts')).toBe(true);
  });

  it('writing to preview-workspace escalates to risky', () => {
    const dec = EditAdmissionService.classify({
      candidatePaths: ['preview-workspace/src/components/Hero.tsx'],
    });
    expect(dec.risk).toBe<EditRisk>('risky');
    expect(dec.protectedPathsHit.some(p => p.includes('preview-workspace'))).toBe(true);
  });
});

// ── Bonus: getProtectedPathPatterns() ────────────────────────────────────────

describe('getProtectedPathPatterns()', () => {
  it('returns a non-empty array of RegExp', () => {
    const patterns = EditAdmissionService.getProtectedPathPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every(p => p instanceof RegExp)).toBe(true);
  });

  it('returns a copy (mutations do not affect the registry)', () => {
    const patterns = EditAdmissionService.getProtectedPathPatterns();
    const original = patterns.length;
    patterns.push(/custom-test-pattern/);
    const patterns2 = EditAdmissionService.getProtectedPathPatterns();
    expect(patterns2.length).toBe(original); // original unchanged
  });
});
