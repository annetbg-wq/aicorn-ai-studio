// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveDesignContext } from '../DesignContract';
import {
  buildScreenCompositionPlan,
} from '../ScreenCompositionPlanner';
import {
  buildFunctionalFlowPlan,
  buildFunctionalFlowPromptBlock,
  buildFunctionalImplementationDiagnostics,
  serializeFunctionalFlowPlan,
} from '../FunctionalFlowPlanner';
import { buildCoderPlanningBlocks } from '../ProtoPipeline';

async function buildPlan(brief: string, skeletonId: 'mobile-app' | 'saas-dashboard' | 'landing-page' | 'social-community' | 'ecommerce') {
  const designCtx = await resolveDesignContext(brief, skeletonId);
  const compositionPlan = buildScreenCompositionPlan({
    brief,
    skeletonId,
    designCtx,
    premiumComponentIds: [],
    mediaHints: [],
  });
  const functionalPlan = buildFunctionalFlowPlan({
    brief,
    skeletonId,
    screenCompositionPlan: compositionPlan,
  });

  return { designCtx, compositionPlan, functionalPlan };
}

describe('FunctionalFlowPlanner — mobile-app', () => {
  it('includes navigation, a primary action, a check or create flow, and derived progress', async () => {
    const { functionalPlan } = await buildPlan('wellness mobile app with habit routine tracking', 'mobile-app');
    const flowIds = functionalPlan.flows.map(flow => flow.id);

    expect(flowIds).toContain('bottom-nav-switch');
    expect(flowIds).toContain('complete-habit');
    expect(flowIds).toContain('scan-or-check-result');
    expect(flowIds).toContain('progress-derived-summary');
    expect(functionalPlan.navigationRules.length).toBeGreaterThan(0);
    expect(functionalPlan.entities.map(entity => entity.id)).toContain('habit');
  });

  it('creates health and wellness specific plan, check, progress, and coach flows', async () => {
    const { functionalPlan } = await buildPlan('health wellness app with habit checks and AI coach', 'mobile-app');
    const flowText = functionalPlan.flows.map(flow => `${flow.id} ${flow.title} ${flow.stateChanges.join(' ')}`).join(' ');

    expect(functionalPlan.primaryUserGoal).toMatch(/wellness|progress/i);
    expect(flowText).toMatch(/habit|check|progress|coach/i);
    expect(functionalPlan.functionalNotes.join(' ')).toMatch(/local React state|mock data/i);
  });
});

describe('FunctionalFlowPlanner — saas-dashboard', () => {
  it('includes search, filter, create, detail, and derived KPI flows', async () => {
    const { functionalPlan } = await buildPlan('SaaS dashboard for experiment quality and launch readiness', 'saas-dashboard');
    const flowIds = functionalPlan.flows.map(flow => flow.id);
    const stateText = functionalPlan.globalStateRequirements.join(' ');

    expect(flowIds).toEqual(expect.arrayContaining([
      'workspace-navigation',
      'search-and-filter',
      'create-work-item',
      'detail-panel-open',
      'quality-dataset-switch',
      'derived-kpi-values',
    ]));
    expect(stateText).toMatch(/query|activeStatus|selectedItemId|kpi/i);
  });
});

describe('FunctionalFlowPlanner — ecommerce', () => {
  it('includes product detail, add to cart, and cart total update flows', async () => {
    const { functionalPlan } = await buildPlan('ecommerce store for athletic gear', 'ecommerce');
    const flowIds = functionalPlan.flows.map(flow => flow.id);
    const entityIds = functionalPlan.entities.map(entity => entity.id);

    expect(flowIds).toEqual(expect.arrayContaining([
      'category-filter',
      'product-detail-open',
      'add-to-cart',
      'cart-quantity-update',
      'checkout-confirmation',
    ]));
    expect(entityIds).toEqual(expect.arrayContaining(['product', 'cartItem', 'checkoutDraft']));
  });
});

describe('FunctionalFlowPlanner — social-community', () => {
  it('includes create post and like, save, and follow state changes', async () => {
    const { functionalPlan } = await buildPlan('social community app for creators', 'social-community');
    const flow = functionalPlan.flows.find(item => item.id === 'like-save-follow');
    const createFlow = functionalPlan.flows.find(item => item.id === 'create-post');

    expect(createFlow?.stateChanges.join(' ')).toMatch(/append post|clear composeDraft/i);
    expect(flow?.stateChanges.join(' ')).toMatch(/liked|saved|following/i);
    expect(functionalPlan.navigationRules.length).toBeGreaterThanOrEqual(3);
  });
});

describe('FunctionalFlowPlanner — landing-page', () => {
  it('includes CTA navigation, product preview tabs, pricing toggle, and FAQ accordion when relevant', async () => {
    const { functionalPlan } = await buildPlan('landing page with product preview, pricing toggle, and FAQ', 'landing-page');
    const flowIds = functionalPlan.flows.map(flow => flow.id);

    expect(flowIds).toEqual(expect.arrayContaining([
      'hero-cta-scroll',
      'product-preview-tabs',
      'pricing-toggle',
      'faq-accordion',
    ]));
  });
});

describe('FunctionalFlowPlanner — prompt and telemetry', () => {
  it('builds coder planning blocks with SCREEN_COMPOSITION_PLAN followed by FUNCTIONAL_FLOW_PLAN', async () => {
    const brief = 'wellness mobile app with habit routine tracking';
    const { designCtx, compositionPlan, functionalPlan } = await buildPlan(brief, 'mobile-app');
    const prompt = buildCoderPlanningBlocks({
      designCtx,
      mediaHints: [],
      compositionPlan,
      functionalFlowPlan: functionalPlan,
    });

    expect(prompt).toContain('SCREEN_COMPOSITION_PLAN');
    expect(prompt).toContain('FUNCTIONAL_FLOW_PLAN');
    expect(prompt.indexOf('SCREEN_COMPOSITION_PLAN')).toBeLessThan(prompt.indexOf('FUNCTIONAL_FLOW_PLAN'));
    expect(prompt).toContain('Do not introduce backend requirements.');
    expect(prompt).toContain('Do not use external APIs.');
  });

  it('serializes telemetry with functional flow plan counts and explicit non-decorative rules', async () => {
    const { functionalPlan } = await buildPlan('project management SaaS dashboard', 'saas-dashboard');
    const telemetry = serializeFunctionalFlowPlan(functionalPlan);
    const promptBlock = buildFunctionalFlowPromptBlock(functionalPlan);

    expect(telemetry.skeleton_id).toBe('saas-dashboard');
    expect(telemetry.flow_count).toBe(functionalPlan.flows.length);
    expect(telemetry.entity_count).toBe(functionalPlan.entities.length);
    expect(telemetry.non_decorative_rules).toContain('Every primary button must have a visible local effect.');
    expect(promptBlock).toContain('NON_DECORATIVE_RULES');
    expect(promptBlock).toContain('DATA_ENTITIES');
  });
});

describe('FunctionalFlowPlanner — implementation diagnostics', () => {
  it('detects likely implementation signals without backend requirements', async () => {
    const { functionalPlan } = await buildPlan('landing page with product preview, pricing toggle, and FAQ', 'landing-page');
    const diagnostics = buildFunctionalImplementationDiagnostics({
      plan: functionalPlan,
      files: {
        'pages/Home.tsx': `
          import { useMemo, useState } from 'react';
          export default function Home() {
            const [activeSection, setActiveSection] = useState('hero');
            const [activePreviewTab, setActivePreviewTab] = useState('overview');
            const [billingPeriod, setBillingPeriod] = useState('monthly');
            const [openFaqId, setOpenFaqId] = useState('faq-1');
            const pricingOptions = [{ id: 'pro', price: billingPeriod === 'annual' ? 29 : 39 }];
            const faqs = [{ id: 'faq-1', question: 'How?', answer: 'Fast.' }];
            const previewViews = [{ id: 'overview', label: 'Overview' }];
            const activePrice = useMemo(() => pricingOptions.reduce((sum, option) => sum + option.price, 0), [pricingOptions]);
            return (
              <main>
                <button onClick={() => { setActiveSection('product-preview'); document.getElementById('product-preview')?.scrollIntoView(); }}>
                  Start trial
                </button>
                {previewViews.map((view) => (
                  <button key={view.id} onClick={() => setActivePreviewTab(view.id)}>{view.label}</button>
                ))}
                <button onClick={() => setBillingPeriod('monthly')}>Monthly</button>
                <button onClick={() => setBillingPeriod('annual')}>Annual</button>
                {faqs.map((faq) => (
                  <button key={faq.id} onClick={() => setOpenFaqId(faq.id)}>{faq.question}</button>
                ))}
                <div>{activePrice}</div>
                <section id="product-preview">{activePreviewTab}</section>
              </main>
            );
          }
        `,
      },
    });

    expect(diagnostics.functionalDiagnosticsChecked).toBe(true);
    expect(diagnostics.stateHookCount).toBeGreaterThan(0);
    expect(diagnostics.handlerCount).toBeGreaterThan(0);
    expect(diagnostics.implementationCoverageRatio).toBeGreaterThanOrEqual(0.7);
    expect(diagnostics.suggestedNextAction).toBe('none');
  });

  it('warns about empty handlers and decorative placeholders', async () => {
    const { functionalPlan } = await buildPlan('social community app for creators', 'social-community');
    const diagnostics = buildFunctionalImplementationDiagnostics({
      plan: functionalPlan,
      files: {
        'pages/Home.tsx': `
          export default function Home() {
            return (
              <main>
                <button onClick={() => {}}>Like</button>
                <button onClick={() => {}}>Create</button>
                <button onClick={() => alert('Coming soon')}>Follow</button>
                <p>Not implemented</p>
              </main>
            );
          }
        `,
      },
    });

    expect(diagnostics.emptyHandlerCount).toBeGreaterThan(0);
    expect(diagnostics.decorativeInteractionWarnings.join(' ')).toMatch(/empty|alert|not implemented/i);
    expect(diagnostics.suggestedNextAction).toBe('add_repair_later');
  });
});
