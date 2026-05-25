// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveDesignContext } from '../DesignContract';
import { buildFunctionalFlowPlan } from '../FunctionalFlowPlanner';
import {
  buildProductSpecificityDiagnostics,
  buildProductSpecificityPlan,
  buildProductSpecificityPromptBlock,
  serializeProductSpecificityDiagnostics,
  serializeProductSpecificityPlan,
} from '../ProductSpecificityPlanner';
import { buildCoderPlanningBlocks } from '../ProtoPipeline';
import { buildScreenCompositionPlan } from '../ScreenCompositionPlanner';
import { buildSkeletonIntegrationPlan } from '../SkeletonIntegrationPlanner';

async function buildPlannerFixture(
  brief: string,
  skeletonId:
    | 'mobile-app' | 'saas-dashboard' | 'landing-page' | 'social-community' | 'ecommerce'
    | 'productivity-tool' | 'b2b-operations-workspace' | 'marketplace-platform'
    | 'creator-editor-workspace' | 'dating-matching-app' | 'gaming-casino-app'
    | 'game-interactive-app' | 'booking-service-app' | 'content-learning-app',
) {
  const designCtx = await resolveDesignContext(brief, skeletonId);
  const premiumComponentIds = designCtx.premiumComponentSelection.selectedComponents.map(component => component.id);
  const compositionPlan = buildScreenCompositionPlan({
    brief,
    skeletonId,
    designCtx,
    premiumComponentIds,
    mediaHints: [],
  });
  const functionalFlowPlan = buildFunctionalFlowPlan({
    brief,
    skeletonId,
    screenCompositionPlan: compositionPlan,
  });
  const skeletonIntegrationPlan = buildSkeletonIntegrationPlan({
    brief,
    skeletonId,
    screenCompositionPlan: compositionPlan,
    functionalFlowPlan,
    premiumComponentIds,
    mediaHints: [],
  });
  const productSpecificityPlan = buildProductSpecificityPlan({
    brief,
    skeletonId,
    screenCompositionPlan: compositionPlan,
    functionalFlowPlan,
    skeletonIntegrationPlan,
    premiumComponentIds,
    mediaHints: [],
  });

  return {
    designCtx,
    compositionPlan,
    functionalFlowPlan,
    skeletonIntegrationPlan,
    productSpecificityPlan,
  };
}

describe('ProductSpecificityPlanner', () => {
  it('creates non-empty product specificity templates for every supported skeleton family', async () => {
    const fixtures = await Promise.all([
      buildPlannerFixture('habit wellness app with daily streaks', 'mobile-app'),
      buildPlannerFixture('review queue dashboard for launch readiness', 'saas-dashboard'),
      buildPlannerFixture('landing page for an approval workflow product', 'landing-page'),
      buildPlannerFixture('creator community with posts and messages', 'social-community'),
      buildPlannerFixture('specialty ecommerce store with variants and orders', 'ecommerce'),
      buildPlannerFixture('project workspace with milestones and blockers', 'productivity-tool'),
      buildPlannerFixture('B2B approval workspace with SLA risk', 'b2b-operations-workspace'),
      buildPlannerFixture('two-sided marketplace for rental listings', 'marketplace-platform'),
      buildPlannerFixture('creator studio with render queue and publish flow', 'creator-editor-workspace'),
      buildPlannerFixture('dating app with swipe discovery and conversations', 'dating-matching-app'),
      buildPlannerFixture('casino demo lobby with rewards and tournaments', 'gaming-casino-app'),
      buildPlannerFixture('interactive puzzle game with levels and score', 'game-interactive-app'),
      buildPlannerFixture('service booking app with providers and slots', 'booking-service-app'),
      buildPlannerFixture('course app with lessons, quiz, and streaks', 'content-learning-app'),
    ]);


    for (const fixture of fixtures) {
      expect(fixture.productSpecificityPlan.domainEntities.length).toBeGreaterThan(0);
      expect(fixture.productSpecificityPlan.productMetrics.length).toBeGreaterThan(0);
      expect(fixture.productSpecificityPlan.productActions.length).toBeGreaterThan(0);
      expect(fixture.productSpecificityPlan.screenSpecificContent.length).toBeGreaterThan(0);
    }
  }, 30_000);

  it('creates a habit and check-in specificity plan for a mobile wellness brief', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'wellness mobile app with habit routine tracking and daily check-ins',
      'mobile-app',
    );

    expect(productSpecificityPlan.inferredDomain).toMatch(/habit|wellness/i);
    expect(productSpecificityPlan.domainEntities.map(entity => entity.id)).toEqual(
      expect.arrayContaining(['habit', 'checkIn', 'reminder']),
    );
    expect(productSpecificityPlan.productMetrics.map(metric => metric.id)).toEqual(
      expect.arrayContaining(['current-streak', 'today-completion', 'weekly-consistency']),
    );
    expect(productSpecificityPlan.screenSpecificContent.find(screen => screen.screenId.includes('home'))?.requiredEntities).toContain('habit');
  });

  it('creates records, workflow, SLA, and owner-oriented specificity for b2b operations', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'B2B operations workspace for approvals, account handoffs, and SLA risk',
      'b2b-operations-workspace',
    );

    expect(productSpecificityPlan.domainEntities.map(entity => entity.id)).toEqual(
      expect.arrayContaining(['record', 'account', 'workflowStage']),
    );
    expect(productSpecificityPlan.productMetrics.map(metric => metric.label).join(' ')).toMatch(/SLA|resolution|stage/i);
    expect(productSpecificityPlan.vocabulary.preferredTerms.join(' ')).toMatch(/owner|record|SLA/i);
  });

  it('creates listing, seller, buyer request, and offer entities for marketplace', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'marketplace platform for equipment rentals with listings and offers',
      'marketplace-platform',
    );

    expect(productSpecificityPlan.domainEntities.map(entity => entity.id)).toEqual(
      expect.arrayContaining(['listing', 'seller', 'buyerRequest', 'offer']),
    );
    expect(productSpecificityPlan.copywritingRules.join(' ')).toMatch(/two-sided|marketplace/i);
  });

  it('creates project, asset, render, and publish entities for creator workspace', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'creator editor workspace for short-form video drafts and render queue',
      'creator-editor-workspace',
    );

    expect(productSpecificityPlan.domainEntities.map(entity => entity.id)).toEqual(
      expect.arrayContaining(['project', 'asset', 'renderJob', 'publishState']),
    );
    expect(productSpecificityPlan.productActions.map(action => action.id)).toContain('queue-render');
  });

  it('creates dating-specific profile, match, and conversation actions', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'dating app with swipe discovery, matching, and messaging',
      'dating-matching-app',
    );

    expect(productSpecificityPlan.productActions.map(action => action.id)).toEqual(
      expect.arrayContaining(['swipe-like', 'pass-profile', 'send-message', 'edit-profile']),
    );
    expect(productSpecificityPlan.vocabulary.preferredTerms.join(' ')).toMatch(/profile|match|conversation/i);
  });

  it('creates demo-only gaming-casino specificity without real-money language', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'casino gaming app with lobby, demo chips, tournaments, and rewards',
      'gaming-casino-app',
    );

    expect(productSpecificityPlan.inferredDomain).toMatch(/demo/i);
    expect(productSpecificityPlan.domainEntities.map(entity => entity.id)).toEqual(
      expect.arrayContaining(['game', 'reward', 'tournament', 'responsibleLimit']),
    );
    expect(productSpecificityPlan.vocabulary.avoidTerms.join(' ')).toMatch(/payment|real money|checkout/i);
  });

  it('creates level and game-state entities for interactive games', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'interactive game with levels, inventory, and achievements',
      'game-interactive-app',
    );

    expect(productSpecificityPlan.domainEntities.map(entity => entity.id)).toEqual(
      expect.arrayContaining(['level', 'gameSession', 'inventoryItem', 'achievement']),
    );
    expect(productSpecificityPlan.productMetrics.map(metric => metric.id)).toContain('current-score');
  });

  it('creates provider, service, slot, and booking entities for booking apps', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'booking app for wellness services with providers and time slots',
      'booking-service-app',
    );

    expect(productSpecificityPlan.domainEntities.map(entity => entity.id)).toEqual(
      expect.arrayContaining(['service', 'provider', 'timeSlot', 'booking']),
    );
    expect(productSpecificityPlan.productActions.map(action => action.id)).toEqual(
      expect.arrayContaining(['choose-slot', 'confirm-booking', 'cancel-booking']),
    );
  });

  it('creates course, lesson, quiz, and progress entities for learning apps', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'learning app with courses, lessons, quizzes, and streaks',
      'content-learning-app',
    );

    expect(productSpecificityPlan.domainEntities.map(entity => entity.id)).toEqual(
      expect.arrayContaining(['course', 'lesson', 'quiz', 'learningProgress']),
    );
    expect(productSpecificityPlan.productActions.map(action => action.id)).toEqual(
      expect.arrayContaining(['continue-lesson', 'start-quiz', 'mark-complete']),
    );
  });

  it('creates product, cart, order, and inventory specificity for ecommerce', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'ecommerce store for specialty coffee gear with variants and orders',
      'ecommerce',
    );

    expect(productSpecificityPlan.domainEntities.map(entity => entity.id)).toEqual(
      expect.arrayContaining(['product', 'variant', 'cartLine', 'order']),
    );
    expect(productSpecificityPlan.productMetrics.map(metric => metric.id)).toEqual(
      expect.arrayContaining(['cart-total', 'low-stock', 'delivery-status']),
    );
  });

  it('creates product-specific landing page copy rules for hero, proof, and CTA', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'landing page for a launch-readiness review workflow',
      'landing-page',
    );
    const promptBlock = buildProductSpecificityPromptBlock(productSpecificityPlan);
    const telemetry = serializeProductSpecificityPlan(productSpecificityPlan);

    expect(productSpecificityPlan.copywritingRules.join(' ')).toMatch(/workflow|CTA|proof/i);
    expect(productSpecificityPlan.forbiddenGenericPatterns).toContain('All-in-one');
    expect(promptBlock).toContain('PRODUCT_SPECIFICITY_PLAN');
    expect(promptBlock).toContain('SCREEN_SPECIFIC_CONTENT');
    expect(telemetry.inferred_domain).toBe(productSpecificityPlan.inferredDomain);
  });

  it('injects PRODUCT_SPECIFICITY_PLAN after the existing planner blocks', async () => {
    const {
      designCtx,
      compositionPlan,
      functionalFlowPlan,
      skeletonIntegrationPlan,
      productSpecificityPlan,
    } = await buildPlannerFixture(
      'wellness mobile app with habit routine tracking',
      'mobile-app',
    );

    const prompt = buildCoderPlanningBlocks({
      designCtx,
      mediaHints: [],
      compositionPlan,
      functionalFlowPlan,
      skeletonIntegrationPlan,
      productSpecificityPlan,
    });

    expect(prompt).toContain('SCREEN_COMPOSITION_PLAN');
    expect(prompt).toContain('FUNCTIONAL_FLOW_PLAN');
    expect(prompt).toContain('SKELETON_INTEGRATION_PLAN');
    expect(prompt).toContain('PRODUCT_SPECIFICITY_PLAN');
    expect(prompt.indexOf('SCREEN_COMPOSITION_PLAN')).toBeLessThan(prompt.indexOf('FUNCTIONAL_FLOW_PLAN'));
    expect(prompt.indexOf('FUNCTIONAL_FLOW_PLAN')).toBeLessThan(prompt.indexOf('SKELETON_INTEGRATION_PLAN'));
    expect(prompt.indexOf('SKELETON_INTEGRATION_PLAN')).toBeLessThan(prompt.indexOf('PRODUCT_SPECIFICITY_PLAN'));
  });
});

describe('ProductSpecificityDiagnostics', () => {
  it('detects Feature 1, Lorem, and AppName placeholders', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'wellness mobile app with habit routine tracking',
      'mobile-app',
    );
    const diagnostics = buildProductSpecificityDiagnostics({
      plan: productSpecificityPlan,
      files: {
        'App.tsx': 'export default function App(){ return <main>Lorem ipsum Feature 1 AppName</main>; }',
      },
    });

    expect(diagnostics.genericPlaceholderFindings).toEqual(expect.arrayContaining([
      'App.tsx: AppName',
      'App.tsx: Feature 1',
      'App.tsx: Lorem',
      'App.tsx: Lorem ipsum',
    ]));
  });

  it('detects vague KPI labels without product qualifiers', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'review queue dashboard for launch readiness',
      'saas-dashboard',
    );
    const diagnostics = buildProductSpecificityDiagnostics({
      plan: productSpecificityPlan,
      files: {
        'pages/Dashboard.tsx': `
          const cards = [
            { label: 'Revenue', value: '42' },
            { label: 'Users', value: '77' },
            { label: 'Growth', value: '12%' },
          ];
          export default function Dashboard(){ return <main>Overview Analytics Insights</main>; }
        `,
      },
    });

    expect(diagnostics.vagueCopyFindings.join(' ')).toMatch(/Analytics|Insights|Overview/);
    expect(diagnostics.emptyMetricFindings.join(' ')).toMatch(/Revenue|Users|Growth/);
  });

  it('rewards domain entity, action, and metric signals', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'marketplace platform for rental listings and seller offers',
      'marketplace-platform',
    );
    const diagnostics = buildProductSpecificityDiagnostics({
      plan: productSpecificityPlan,
      files: {
        'pages/Home.tsx': `
          const listings = ['Downtown photo studio rental', 'Vintage road bike'];
          export default function Home() {
            return (
              <main>
                <h1>Listings available now</h1>
                <button>Make offer</button>
                <p>Active listings</p>
                <p>Offers awaiting reply</p>
                <p>Seller availability</p>
              </main>
            );
          }
        `,
      },
    });

    expect(diagnostics.domainEntitySignalCount).toBeGreaterThan(0);
    expect(diagnostics.productActionSignalCount).toBeGreaterThan(0);
    expect(diagnostics.productMetricSignalCount).toBeGreaterThan(0);
    expect(diagnostics.specificityScore).toBeGreaterThanOrEqual(80);
  });

  it('is telemetry-only and never throws when specificity is weak', async () => {
    const { productSpecificityPlan } = await buildPlannerFixture(
      'booking app for services with appointment reminders',
      'booking-service-app',
    );

    const run = () => {
      const diagnostics = buildProductSpecificityDiagnostics({
        plan: productSpecificityPlan,
        files: {
          'App.tsx': 'export default function App(){ const items = []; return <main>Dashboard</main>; }',
        },
      });
      return serializeProductSpecificityDiagnostics(diagnostics);
    };

    expect(run).not.toThrow();
    expect(run().specificity_diagnostics_checked).toBe(true);
    expect(run().suggested_next_action).toMatch(/none|improve_prompt|improve_specificity_plan|add_repair_later/);
  });
});
