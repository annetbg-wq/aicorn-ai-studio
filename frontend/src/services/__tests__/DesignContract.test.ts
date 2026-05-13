// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { ArchetypeManifest, DomainManifest } from '../PrototypeBankService';

const archetypes: Record<string, ArchetypeManifest> = {
  'dashboard-workspace': {
    id: 'dashboard-workspace',
    type: 'archetype',
    name: 'Dashboard Workspace',
    description: 'Desktop-first operating workspace',
    whenToUse: ['operator dashboards'],
    navigation: 'sidebar',
    includes: ['KPICard', 'DataTable', 'OnboardingChecklist'],
    forbids: ['bottom-tab navigation'],
    routes: ['/', '/dashboard'],
    requiredModules: ['dashboard', 'table', 'settings'],
    optionalModules: ['notifications'],
    entities: ['workspace', 'report', 'task'],
  },
  'consumer-feed': {
    id: 'consumer-feed',
    type: 'archetype',
    name: 'Consumer Feed',
    description: 'Scroll-friendly consumer product shell',
    whenToUse: ['consumer mobile experiences'],
    navigation: 'bottom-tabs',
    includes: ['Hero', 'Feed', 'BottomTabs'],
    forbids: ['dense desktop-only tables'],
    routes: ['/', '/feed'],
    requiredModules: ['feed', 'profile'],
    optionalModules: ['search'],
    entities: ['user', 'post', 'message'],
  },
};

const domains: Record<string, DomainManifest> = {
  medicine: {
    id: 'medicine',
    type: 'domain',
    name: 'Medicine',
    entities: ['patient', 'appointment'],
    roles: ['clinician'],
    typicalFlows: ['review status', 'plan follow-up'],
    restrictions: ['Avoid alarming visuals'],
    uiPatterns: ['status cards', 'calm summaries'],
    recommendedDesign: 'calm',
    recommendedArchetypes: ['dashboard-workspace'],
  },
  fintech: {
    id: 'fintech',
    type: 'domain',
    name: 'Fintech',
    entities: ['wallet', 'transaction'],
    roles: ['operator'],
    typicalFlows: ['track balances', 'review transactions'],
    restrictions: ['Emphasize trust'],
    uiPatterns: ['metrics', 'tables'],
    recommendedDesign: 'corporate',
    recommendedArchetypes: ['dashboard-workspace'],
  },
};

vi.mock('../PrototypeBankService', () => ({
  PrototypeBankService: {
    getArchetype: vi.fn(async (id: string) => archetypes[id] ?? null),
    getDomain: vi.fn(async (id: string) => domains[id] ?? null),
  },
}));

import {
  resolveDesignContext,
  validateDesignContract,
  designContractForCoder,
  archetypeContextForArchitect,
  themeFile,
} from '../DesignContract';

describe('DesignContract — resolver', () => {
  it('picks dashboard-workspace archetype for saas-dashboard skeleton', async () => {
    const ctx = await resolveDesignContext('a project tracker for teams', 'saas-dashboard');
    expect(ctx.archetype?.id).toBe('dashboard-workspace');
    expect(ctx.theme.cssVars).toMatch(/--background:/);
    expect(ctx.fallbackVisualSelection).toBe(false);
    expect(ctx.visualSelection.selectedPackId).toBe('saas-dashboard');
    expect(ctx.visualSelection.selectedVariantPath).toMatch(/prototype-bank\/design-packs\/domain\/saas-dashboard\/visual-variants\/.+\.json/);
  });

  it('picks medicine domain on medical keywords', async () => {
    const ctx = await resolveDesignContext('appointment booking for a clinic and patient records', 'mobile-app');
    expect(ctx.domain?.id).toBe('medicine');
    // Medicine → calm mood
    expect(ctx.intent.mood).toBe('calm');
  });

  it('picks fintech domain on banking keywords', async () => {
    const ctx = await resolveDesignContext('crypto wallet with transactions and budget tracking', 'mobile-app');
    expect(ctx.domain?.id).toBe('fintech');
    expect(ctx.intent.mood).toBe('corporate');
  });

  it('uses file-backed visual bank for known skeleton even when no semantic domain matches', async () => {
    const ctx = await resolveDesignContext('a thing', 'saas-dashboard');
    expect(ctx.domain).toBeNull();
    expect(ctx.fallbackVisualSelection).toBe(false);
    expect(ctx.visualSelection.selectedPackId).toBe('saas-dashboard');
    expect(ctx.theme.cssVars.length).toBeGreaterThan(50);
  });

  it('themeFile produces a CSS file with --background variable', async () => {
    const ctx = await resolveDesignContext('test', 'saas-dashboard');
    const f = themeFile(ctx);
    expect(f.path).toBe('styles/generated-theme.css');
    expect(f.content).toMatch(/--background/);
  });
});

describe('DesignContract — prompt fragments', () => {
  it('archetype context mentions navigation and required modules', async () => {
    const ctx = await resolveDesignContext('build me a clinic admin panel', 'saas-dashboard');
    const txt = archetypeContextForArchitect(ctx);
    expect(txt).toMatch(/ARCHETYPE/);
    expect(txt).toMatch(/navigation/);
    expect(txt).toMatch(/DOMAIN/);
    expect(txt).toMatch(/VISUAL_BANK_SELECTION/);
    expect(txt).toMatch(/PREMIUM_COMPONENT_SELECTION/);
    expect(txt).toMatch(/selectedVariantPath: prototype-bank\/design-packs\/domain\/saas-dashboard\/visual-variants\/.+\.json/);
  });

  it('coder contract bans raw colors and forbids tailwind palette utilities', async () => {
    const ctx = await resolveDesignContext('test', 'mobile-app');
    const txt = designContractForCoder(ctx);
    expect(txt).toMatch(/FORBIDDEN/);
    expect(txt).toMatch(/bg-blue-500/);
    expect(txt).toMatch(/bg-background text-foreground/);
    expect(txt).toMatch(/VISUAL_BANK_SELECTION/);
    expect(txt).toMatch(/PREMIUM_COMPONENT_SELECTION/);
    expect(txt).toMatch(/selectedRecipeId: health-wellness-mobile|selectedRecipeId: mobile-consumer-app/);
    expect(txt).toMatch(/componentSourceFiles:/);
    expect(txt).toMatch(/previewAdapterFiles:/);
    expect(txt).toMatch(/fallbackVisualSelection: false/);
    expect(txt).toMatch(/prototype-bank\/design-packs\/domain\/mobile-app\/visual-variants\/.+\.json/);
    expect(txt).toMatch(/sourceFiles:/);
    expect(txt).toMatch(/Use this selected visual variant as the source of design truth/);
    expect(txt).toMatch(/Before inventing UI, check selected premium component recipe/);
  });

  it('marks hardcoded visual selection as fallback when file packs are unavailable', async () => {
    const ctx = await resolveDesignContext('test', 'mobile-app', { visualPacksOverride: [] });
    const txt = designContractForCoder(ctx);

    expect(ctx.fallbackVisualSelection).toBe(true);
    expect(ctx.visualSelection.selectedPackId).toBe('hardcoded-fallback');
    expect(txt).toMatch(/VISUAL_BANK_SELECTION/);
    expect(txt).toMatch(/fallbackVisualSelection: true/);
  });
});

describe('DesignContract — validator', () => {
  const okCtx = null;

  it('passes clean semantic-token code', () => {
    const v = validateDesignContract({
      'pages/Home.tsx': `
        export default function Home() {
          return <div className="bg-background text-foreground p-4 rounded-2xl border-border">
            <button className="bg-primary text-primary-foreground">Go</button>
          </div>;
        }`,
    }, okCtx);
    expect(v.ok).toBe(true);
  });

  it('rejects raw hex in style', () => {
    const v = validateDesignContract({
      'pages/Bad.tsx': `<div style={{ color: '#ff0000' }} />`,
    }, okCtx);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.violations[0].rule).toBe('no-raw-hex');
    }
  });

  it('rejects tailwind palette utilities', () => {
    const v = validateDesignContract({
      'pages/Bad.tsx': `<div className="bg-blue-500 text-white" />`,
    }, okCtx);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const rules = v.violations.map(x => x.rule);
      expect(rules).toContain('no-tailwind-palette');
    }
  });

  it('rejects generic bg-white text-black fallback', () => {
    const v = validateDesignContract({
      'pages/Bad.tsx': `<div className="bg-white text-black" />`,
    }, okCtx);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const rules = v.violations.map(x => x.rule);
      expect(rules).toContain('no-generic-fallback');
    }
  });

  it('skips the auto-generated theme file', async () => {
    const ctx = await resolveDesignContext('test', 'mobile-app');
    const tf = themeFile(ctx);
    const v = validateDesignContract({ [tf.path]: tf.content }, ctx);
    expect(v.ok).toBe(true);
  });

  it('skips css/json/md/svg files', () => {
    const v = validateDesignContract({
      'styles/x.css': 'body { color: #fff; }',
      'data.json':    '{"hex":"#abc"}',
    }, okCtx);
    expect(v.ok).toBe(true);
  });
});
