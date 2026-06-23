// @vitest-environment jsdom
/**
 * Topic marker + dedup/reuse + deep-doc coverage for the product document package.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeTopicMarker,
  materializeProductDocumentSet,
  resolveProductDocumentSet,
  buildCoderContractBrief,
  type ProductDocumentSetInput,
} from '../ProductDocumentSet';
import { DocumentPackageRegistry } from '../DocumentPackageRegistry';

function input(over: Partial<ProductDocumentSetInput> = {}): ProductDocumentSetInput {
  return {
    prompt: 'Build an AI personal finance copilot with budgets, transactions and savings goals',
    skeletonId: 'saas-dashboard',
    projectId: 'p1',
    runId: 'r1',
    architectPlan: { appName: 'Finance Copilot', summary: 'A finance copilot', fileTree: {} },
    ...over,
  };
}

beforeEach(() => DocumentPackageRegistry.clear());
afterEach(() => DocumentPackageRegistry.clear());

describe('computeTopicMarker', () => {
  it('is stable for the same topic and includes a key/label/signals', () => {
    const a = computeTopicMarker(input());
    const b = computeTopicMarker(input());
    expect(a.key).toBe(b.key);
    expect(a.key).toMatch(/^tm1_/);
    expect(a.label).toBeTruthy();
    expect(a.signals.length).toBeGreaterThan(0);
  });

  it('collapses EN/RU rewordings of the same topic to the same key', () => {
    const en = computeTopicMarker(input({ prompt: 'Build a finance copilot app with budgets transactions savings' }));
    const ru = computeTopicMarker(input({ prompt: 'Сделай приложение finance copilot с budgets transactions savings' }));
    expect(en.key).toBe(ru.key);
  });

  it('is INVARIANT to the (run-varying) skeleton/domain — same brief ⇒ same key', () => {
    // Skeleton selection and domain inference vary run-to-run for the same request;
    // the topic key must not depend on them, or identical requests would not dedup.
    const a = computeTopicMarker(input({ skeletonId: 'saas-dashboard' }));
    const b = computeTopicMarker(input({ skeletonId: 'mobile-app' }));
    expect(a.key).toBe(b.key);
  });

  it('differs by topic tokens', () => {
    const fin = computeTopicMarker(input());
    const other = computeTopicMarker(input({ prompt: 'Build a dating matching app with swipe and chat' }));
    expect(other.key).not.toBe(fin.key);
  });

  it('keys on topicPrompt (raw brief), NOT the run-varying clarified prompt', () => {
    // The pipeline passes an LLM-clarified prompt as `prompt` (varies each run) and
    // the raw user brief as `topicPrompt`. Same raw brief ⇒ same key regardless of
    // how the clarifier reworded `prompt`.
    const a = computeTopicMarker(input({ topicPrompt: 'finance copilot budgets', prompt: 'A polished AI finance copilot that tracks budgets, transactions and goals with insights' }));
    const b = computeTopicMarker(input({ topicPrompt: 'finance copilot budgets', prompt: 'Personal finance assistant app: dashboards, spending categories, savings — fully wired' }));
    expect(a.key).toBe(b.key);
  });
});

describe('resolveProductDocumentSet — dedup/reuse', () => {
  it('materializes once, then reuses the same package for the same topic', () => {
    const first = resolveProductDocumentSet(input());
    expect(first.reused).toBe(false);
    expect(DocumentPackageRegistry.has(first.topicMarker.key)).toBe(true);

    const second = resolveProductDocumentSet(input({ projectId: 'p2', runId: 'r2' }));
    expect(second.reused).toBe(true);
    expect(second.topicMarker.key).toBe(first.topicMarker.key);
    // reused content is the stored package, not a fresh build
    expect(Object.keys(second.files).sort()).toEqual(Object.keys(first.files).sort());
  });

  it('does not collide across distinct topics', () => {
    const fin = resolveProductDocumentSet(input());
    const dating = resolveProductDocumentSet(input({
      prompt: 'Build a dating matching app with swipe discovery and chat',
      skeletonId: 'dating-matching-app',
      architectPlan: { appName: 'SparkMatch', summary: 'dating', fileTree: {} },
    }));
    expect(dating.reused).toBe(false);
    expect(dating.topicMarker.key).not.toBe(fin.topicMarker.key);
    expect(DocumentPackageRegistry.list().length).toBe(2);
  });
});

describe('deep document coverage', () => {
  it('materializes the full-logic documents + a MANIFEST carrying the topic marker', () => {
    const res = materializeProductDocumentSet(input());
    const names = res.materializedFiles.map(p => p.replace(/^.*\//, ''));
    for (const doc of [
      'backend-architecture.md', 'service-integrations.md', 'onboarding-strategy.md',
      'monetization-paywall.md', 'auth-access-control.md', 'i18n-localization.md',
      'legal-compliance.md', 'media-visual-system.md', 'MANIFEST.json',
    ]) {
      expect(names).toContain(doc);
    }
    const manifest = JSON.parse(res.files['docs/architect/MANIFEST.json']);
    expect(manifest.topicMarker.key).toBe(res.productDocs.topicMarker.key);
    expect(manifest.kind).toBe('aic-studio-product-document-package');
  });

  it('infers Stripe billing for a monetized finance brief', () => {
    const res = materializeProductDocumentSet(input());
    expect(res.files['docs/architect/service-integrations.md']).toMatch(/Stripe/);
  });
});

describe('buildCoderContractBrief — coder contract', () => {
  it('distils a compact, directive "build to this" contract from the package', () => {
    const res = materializeProductDocumentSet(input());
    const brief = buildCoderContractBrief(res.productDocs);
    expect(brief).toMatch(/PRODUCT CONTRACT/);
    expect(brief).toMatch(/MUST deliver/);
    expect(brief).toMatch(/Onboarding/);
    expect(brief).toMatch(/Monetization|paywall/i);
    expect(brief).toMatch(/empty\/loading\/error/);
    expect(brief).toMatch(/i18n/);
  });

  it('is token-bounded (compact enough for the coder prompt)', () => {
    const brief = buildCoderContractBrief(materializeProductDocumentSet(input()).productDocs, { maxChars: 1500 });
    expect(brief.length).toBeLessThanOrEqual(1560);
  });
});
