// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveDesignContext } from '../DesignContract';
import { buildFunctionalFlowPlan } from '../FunctionalFlowPlanner';
import { buildCoderPlanningBlocks } from '../ProtoPipeline';
import { buildScreenCompositionPlan } from '../ScreenCompositionPlanner';
import {
  buildArchitectureImplementationDiagnostics,
  buildArchitectureQualityRulesBlock,
  buildSkeletonIntegrationPlan,
  buildSkeletonIntegrationPromptBlock,
  serializeArchitectureImplementationDiagnostics,
  serializeSkeletonIntegrationPlan,
} from '../SkeletonIntegrationPlanner';

async function buildPlannerFixture(
  brief: string,
  skeletonId: 'mobile-app' | 'saas-dashboard' | 'landing-page' | 'social-community' | 'ecommerce' | 'productivity-tool',
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

  return { designCtx, compositionPlan, functionalFlowPlan, skeletonIntegrationPlan };
}

describe('SkeletonIntegrationPlanner', () => {
  it('marks mobile-app fit strong for a health habit mobile app and keeps bypass disabled', async () => {
    const { skeletonIntegrationPlan } = await buildPlannerFixture(
      'wellness mobile app with habit routine tracking and progress coach',
      'mobile-app',
    );

    expect(skeletonIntegrationPlan.skeletonFit).toBe('strong');
    expect(skeletonIntegrationPlan.skeletonBypassAllowed).toBe(false);
    expect(skeletonIntegrationPlan.skeletonFitReason).toMatch(/align/i);
    expect(skeletonIntegrationPlan.codeQualityRules).toContain(
      'App.tsx should orchestrate layout/routing, not contain every screen and all data.',
    );
  });

  it('keeps bypass disabled for all app skeletons and enabled only for landing-page', async () => {
    const fixtures = await Promise.all([
      buildPlannerFixture('quality ops SaaS dashboard with work queue and detail panel', 'saas-dashboard'),
      buildPlannerFixture('social community app for creators with feed and messages', 'social-community'),
      buildPlannerFixture('ecommerce store for athletic gear with cart and checkout', 'ecommerce'),
      buildPlannerFixture('productivity tool for tasks and projects', 'productivity-tool'),
      buildPlannerFixture('landing page for product launch with hero, pricing, and FAQ', 'landing-page'),
    ]);

    expect(fixtures[0].skeletonIntegrationPlan.skeletonBypassAllowed).toBe(false);
    expect(fixtures[1].skeletonIntegrationPlan.skeletonBypassAllowed).toBe(false);
    expect(fixtures[2].skeletonIntegrationPlan.skeletonBypassAllowed).toBe(false);
    expect(fixtures[3].skeletonIntegrationPlan.skeletonBypassAllowed).toBe(false);
    expect(fixtures[4].skeletonIntegrationPlan.skeletonBypassAllowed).toBe(true);
  });

  it('records weak fit for an app skeleton mismatch without allowing bypass', async () => {
    const { skeletonIntegrationPlan } = await buildPlannerFixture(
      'landing page for an AI launch with pricing, FAQ, and hero preview',
      'mobile-app',
    );

    expect(skeletonIntegrationPlan.skeletonFit).toBe('weak');
    expect(skeletonIntegrationPlan.skeletonBypassAllowed).toBe(false);
    expect(skeletonIntegrationPlan.integrationNotes.join(' ')).toMatch(/warning|closest skeleton|future new skeleton/i);
  });

  it('includes dashboard shell reuse, table/detail modules, file ownership rules, and forbidden non-bypass patterns', async () => {
    const { skeletonIntegrationPlan } = await buildPlannerFixture(
      'SaaS dashboard for experiment quality and launch readiness with work queue and detail panel',
      'saas-dashboard',
    );
    const serialized = serializeSkeletonIntegrationPlan(skeletonIntegrationPlan);
    const promptBlock = buildSkeletonIntegrationPromptBlock(skeletonIntegrationPlan);

    expect(skeletonIntegrationPlan.reuseStrategy.some(strategy => strategy.area === 'dashboard shell/sidebar/topbar')).toBe(true);
    expect(skeletonIntegrationPlan.customModules.map(module => module.recommendedPath)).toEqual(expect.arrayContaining([
      'components/WorkQueueTable.tsx',
      'components/DetailPanel.tsx',
    ]));
    expect(skeletonIntegrationPlan.fileOwnershipRules.map(rule => rule.filePattern)).toContain('App.tsx');
    expect(skeletonIntegrationPlan.forbiddenPatterns).toContain('one massive App.tsx');
    expect(skeletonIntegrationPlan.forbiddenPatterns).toContain('bypassing the selected skeleton for app prototypes');
    expect(serialized.skeleton_bypass_allowed).toBe(false);
    expect(promptBlock).toContain('FILE_OWNERSHIP_RULES');
    expect(promptBlock).toContain('FORBIDDEN_PATTERNS');
  });
});

describe('Skeleton integration prompt wiring', () => {
  it('adds architecture quality rules and keeps the app skeleton non-bypass rule explicit', () => {
    const rules = buildArchitectureQualityRulesBlock();

    expect(rules).toContain('ARCHITECTURE_QUALITY_RULES');
    expect(rules).toContain('For app prototypes, the selected skeleton is mandatory and must not be bypassed.');
    expect(rules).toContain('Do not build a parallel app architecture outside the skeleton.');
  });

  it('builds coder planning blocks with SCREEN_COMPOSITION_PLAN, FUNCTIONAL_FLOW_PLAN, and SKELETON_INTEGRATION_PLAN in order', async () => {
    const { designCtx, compositionPlan, functionalFlowPlan, skeletonIntegrationPlan } = await buildPlannerFixture(
      'wellness mobile app with habit routine tracking',
      'mobile-app',
    );
    const prompt = buildCoderPlanningBlocks({
      designCtx,
      mediaHints: [],
      compositionPlan,
      functionalFlowPlan,
      skeletonIntegrationPlan,
    });

    expect(prompt).toContain('SCREEN_COMPOSITION_PLAN');
    expect(prompt).toContain('FUNCTIONAL_FLOW_PLAN');
    expect(prompt).toContain('SKELETON_INTEGRATION_PLAN');
    expect(prompt.indexOf('SCREEN_COMPOSITION_PLAN')).toBeLessThan(prompt.indexOf('FUNCTIONAL_FLOW_PLAN'));
    expect(prompt.indexOf('FUNCTIONAL_FLOW_PLAN')).toBeLessThan(prompt.indexOf('SKELETON_INTEGRATION_PLAN'));
    expect(prompt).toContain('Do not bypass the selected skeleton unless skeletonId is landing-page.');
  });
});

describe('Architecture implementation diagnostics', () => {
  it('detects huge App.tsx and missing pages/screens when multiple screens are expected', async () => {
    const { compositionPlan, functionalFlowPlan, skeletonIntegrationPlan } = await buildPlannerFixture(
      'quality ops SaaS dashboard with work queue and detail panel',
      'saas-dashboard',
    );
    const hugeApp = Array.from({ length: 260 }, (_, index) => `const line${index} = ${index};`).join('\n');
    const diagnostics = buildArchitectureImplementationDiagnostics({
      files: {
        'App.tsx': `import { useState } from 'react';\n${hugeApp}\nexport default function App(){ const [activeView, setActiveView] = useState('dashboard'); return <main>{activeView}</main>; }`,
      },
      skeletonId: 'saas-dashboard',
      screenCompositionPlan: compositionPlan,
      functionalFlowPlan,
      skeletonIntegrationPlan,
    });

    expect(diagnostics.giantFileWarnings.join(' ')).toMatch(/App\.tsx is/);
    expect(diagnostics.missingModuleBoundaryWarnings.join(' ')).toMatch(/pages\/screens/i);
    expect(diagnostics.skeletonBypassWarnings.join(' ')).toMatch(/App\.tsx|parallel custom navigation|missing/i);
    expect(diagnostics.architectureDiagnosticsChecked).toBe(true);
  });

  it('counts components, hooks, and data files and keeps diagnostics telemetry-only', async () => {
    const { compositionPlan, functionalFlowPlan, skeletonIntegrationPlan } = await buildPlannerFixture(
      'productivity tool for tasks and projects',
      'productivity-tool',
    );
    const run = () => buildArchitectureImplementationDiagnostics({
      files: {
        'App.tsx': 'import Workspace from "./pages/Workspace"; export default function App(){ return <Workspace />; }',
        'pages/Workspace.tsx': 'import TaskBoard from "../components/TaskBoard"; export default function Workspace(){ return <TaskBoard />; }',
        'pages/Projects.tsx': 'export default function Projects(){ return <section>Projects</section>; }',
        'components/TaskBoard.tsx': 'export default function TaskBoard(){ return <section>Board</section>; }',
        'hooks/useWorkspaceState.ts': 'export function useWorkspaceState(){ return { activeFilter: "all" }; }',
        'data/tasks.ts': 'export const tasks = [{ id: "1", title: "Ship" }];',
      },
      skeletonId: 'productivity-tool',
      screenCompositionPlan: compositionPlan,
      functionalFlowPlan,
      skeletonIntegrationPlan,
    });
    const diagnostics = run();
    const telemetry = serializeArchitectureImplementationDiagnostics(diagnostics);

    expect(run).not.toThrow();
    expect(diagnostics.generatedScreenFileCount).toBeGreaterThanOrEqual(3);
    expect(diagnostics.generatedComponentFileCount).toBe(1);
    expect(diagnostics.generatedHookFileCount).toBe(1);
    expect(diagnostics.generatedDataFileCount).toBe(1);
    expect(telemetry.architecture_diagnostics_checked).toBe(true);
    expect(telemetry.suggested_next_action).toMatch(/none|improve_prompt|split_modules_later|add_repair_later|consider_new_skeleton_later/);
  });
});
