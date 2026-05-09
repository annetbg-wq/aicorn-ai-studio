// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
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

  it('falls back to generic mood when no domain matches', async () => {
    const ctx = await resolveDesignContext('a thing', 'saas-dashboard');
    expect(ctx.domain).toBeNull();
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
  });

  it('coder contract bans raw colors and forbids tailwind palette utilities', async () => {
    const ctx = await resolveDesignContext('test', 'mobile-app');
    const txt = designContractForCoder(ctx);
    expect(txt).toMatch(/FORBIDDEN/);
    expect(txt).toMatch(/bg-blue-500/);
    expect(txt).toMatch(/bg-background text-foreground/);
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
