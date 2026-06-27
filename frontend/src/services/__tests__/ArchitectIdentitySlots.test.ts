// @vitest-environment node
/**
 * ArchitectIdentitySlots.test.ts
 *
 * Locks the universal product-identity slot forcing in augmentArchitectPlan.
 * Live failure (Cashflow Guard / clinic triage): the architect omitted the
 * editable identity files, the coder never touched them, and the build shipped
 * a generic mobile shell (AppName, Morning intention, Home/Create/Progress/Profile).
 * augmentArchitectPlan must force config/app.ts, data/seed.ts and config/navigation.ts
 * into the plan for ANY skeleton so the coder fills them with domain content.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ data: null, error: new Error('disabled') }) }) },
}));

import { augmentArchitectPlan } from '../ProtoPipeline';

const base = (fileTree: Record<string, string>) => ({
  prompt: 'Cashflow Guard — invoice and cashflow tracker for freelancers',
  skeletonId: 'mobile-app' as const,
  fileTree,
  pages: [],
  notes: [],
});

describe('augmentArchitectPlan — universal identity slots', () => {
  it('forces config/app.ts, data/seed.ts, config/navigation.ts when the architect omitted them', () => {
    const out = augmentArchitectPlan(base({ 'pages/Home.tsx': 'home' }));
    expect(out.fileTree['config/app.ts']).toBeTruthy();
    expect(out.fileTree['data/seed.ts']).toBeTruthy();
    expect(out.fileTree['config/navigation.ts']).toBeTruthy();
  });

  it('does not overwrite identity files the architect already planned', () => {
    const out = augmentArchitectPlan(base({ 'data/seed.ts': 'architect seed purpose' }));
    expect(out.fileTree['data/seed.ts']).toBe('architect seed purpose');
  });

  it('the forced seed/app purposes steer the coder away from generic placeholders', () => {
    const out = augmentArchitectPlan(base({}));
    expect(out.fileTree['config/app.ts']).toMatch(/never "AppName"|real app name/i);
    expect(out.fileTree['data/seed.ts']).toMatch(/never generic|realistic domain/i);
  });
});
