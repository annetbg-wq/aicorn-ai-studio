// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { buildProductDocumentSet, materializeProductDocumentSet } from '../ProductDocumentSet';
import { ProjectStorage, type StoredProject } from '../ProjectStorage';
import type { ProjectPlan } from '../types/ProjectPlan';
import type { ProductDocumentSetInput } from '../ProductDocumentSet';

const REQUIRED_MARKDOWN_FILES = [
  'vision.md',
  'feature-checklist.md',
  'screens.md',
  'flows.md',
  'data-model.md',
  'design-brief.md',
  'implementation-brief.md',
  'acceptance.md',
] as const;

function createPlan(): ProjectPlan {
  return {
    appName: 'SprintBoard',
    description: 'Track weekly delivery rituals.',
    theme: 'warm-minimal',
    targetUser: 'Engineering leads running weekly sprint rituals',
    layout: { type: 'app', navigation: 'sidebar' },
    pages: [
      {
        path: '/dashboard',
        name: 'Dashboard',
        file: 'pages/Dashboard.tsx',
        purpose: 'Weekly delivery overview.',
        isMainScreen: true,
        keyElements: ['Delivery scorecard', 'Risk radar', 'Primary CTA'],
      },
      {
        path: '/projects',
        name: 'Projects',
        file: 'pages/Projects.tsx',
        purpose: 'Inspect current sprint projects.',
        isMainScreen: false,
      },
    ],
    dataModel: {
      entities: [
        { name: 'Sprint', fields: 'id, name, velocity, burnup' },
        { name: 'Risk', fields: 'id, title, severity, owner' },
      ],
      sharedState: 'selectedSprintId, filters, highlightedRiskId',
    },
    shadcnComponents: ['Alert', 'Button', 'Card', 'Tabs'],
    icons: ['Calendar', 'Flag'],
    kickoffScope: {
      id: 'core_backend',
      label: 'Core + backend',
      description: 'Ship the core workflows with persistence.',
      selectedCapabilityIds: ['analytics', 'backend'],
      deferredCapabilityIds: ['payments'],
    },
  } as ProjectPlan;
}

function createInput(): ProductDocumentSetInput {
  return {
    prompt: 'Build a sprint planning cockpit for engineering leads.',
    projectId: 'project-sprintboard',
    revisionId: 'revision-001',
    runId: 'run-001',
    skeletonId: 'saas-dashboard' as const,
    prebuiltPlan: createPlan(),
    architectPlan: {
      appName: 'SprintBoard',
      summary: 'A delivery cockpit for weekly planning and review.',
      pages: [
        {
          path: '/dashboard',
          name: 'Dashboard',
          file: 'pages/Dashboard.tsx',
          purpose: 'Weekly delivery overview.',
        },
        {
          path: '/projects',
          name: 'Projects',
          file: 'pages/Projects.tsx',
          purpose: 'Project-level drilldown.',
        },
      ],
      fileTree: {
        'pages/Dashboard.tsx': 'Main planning dashboard.',
        'pages/Projects.tsx': 'Project drilldown and ownership view.',
        'components/RiskRadar.tsx': 'Risk radar summary card.',
      },
      notes: ['Keep the narrative focused on weekly delivery rituals.'],
      dataModel: 'Sprint: { id, name, velocity, burnup[] }; Risk: { id, severity, owner }',
      contextContract: 'Builder owns implementation details but must ship the required sprint surfaces.',
    },
    compositionPlan: {
      skeletonId: 'saas-dashboard',
      firstScreenId: 'dashboard',
      screens: [
        {
          id: 'dashboard',
          title: 'Dashboard',
          routeHint: '/dashboard',
          role: 'dashboard',
          priority: 'primary',
          layoutIntent: 'Delivery command center with scorecards and a risk rail.',
          zones: [
            {
              id: 'hero-scorecard',
              role: 'hero',
              priority: 'primary',
              intent: 'Show sprint health and momentum at a glance.',
              suggestedComponents: ['Card'],
              suggestedMedia: [],
              interactions: ['view sprint health'],
              contentRules: ['Use real sprint metrics'],
            },
          ],
          premiumComponentTargets: ['velocity-ring'],
          mediaTargets: [],
          requiredInteractions: ['filter sprint', 'open project detail'],
          stateRequirements: ['selected sprint filter'],
          contentRequirements: ['delivery scorecard', 'risk radar'],
        },
      ],
      globalLayoutRules: ['Keep the main scorecards above the fold.'],
      avoidPatterns: ['placeholder-only KPI cards'],
      compositionNotes: ['Use one primary CTA for weekly planning.'],
    },
    functionalFlowPlan: {
      skeletonId: 'saas-dashboard',
      primaryUserGoal: 'Review sprint health and unblock risky projects quickly.',
      entities: [
        {
          id: 'sprint',
          label: 'Sprint',
          fields: [
            { name: 'name', type: 'string', example: 'Sprint 28' },
            { name: 'velocity', type: 'number', example: '34' },
          ],
          sampleCount: 3,
        },
      ],
      flows: [
        {
          id: 'review-health',
          title: 'Review sprint health',
          screenId: 'dashboard',
          userIntent: 'Understand whether the sprint is on track.',
          triggerElements: ['Sprint filter', 'Health card'],
          stateChanges: ['selected sprint changes', 'health summary recalculates'],
          affectedEntities: ['sprint'],
          visibleFeedback: ['Scorecard updates', 'Risk radar refreshes'],
          navigationTarget: '/dashboard',
          requiredImplementation: ['Derived KPI state', 'Filter handler', 'Visible scorecard diff'],
        },
      ],
      globalStateRequirements: ['Selected sprint persists while navigating locally.'],
      navigationRules: [
        {
          from: '/dashboard',
          to: '/projects',
          trigger: 'Open project drilldown',
          expectedBehavior: 'Navigate to the selected project context.',
        },
      ],
      nonDecorativeRules: ['Primary CTA must open the weekly planning flow.'],
      functionalNotes: ['Use deterministic local mock data only.'],
    },
    skeletonIntegrationPlan: {
      skeletonId: 'saas-dashboard',
      skeletonFit: 'strong',
      skeletonFitReason: 'The dashboard skeleton already matches a multi-panel operations cockpit.',
      skeletonBypassAllowed: false,
      skeletonBypassRule: 'Do not replace the selected shell.',
      reuseStrategy: [
        {
          area: 'navigation shell',
          reuseMode: 'use_as_is',
          reason: 'The sidebar and layout already fit the product.',
        },
      ],
      extensionStrategy: [
        {
          area: 'risk drilldown',
          extensionMode: 'add_component',
          targetFiles: ['components/RiskRadar.tsx'],
          reason: 'The product needs a dedicated risk summary component.',
        },
      ],
      customModules: [
        {
          id: 'risk-radar',
          purpose: 'Surface high-risk projects in one compact module.',
          recommendedPath: 'components/RiskRadar.tsx',
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: ['pages/Dashboard.tsx'],
        },
      ],
      fileOwnershipRules: [],
      codeQualityRules: ['Keep Dashboard focused on composition and derived state.'],
      forbiddenPatterns: ['one massive App.tsx'],
      integrationNotes: ['Wrap skeleton cards instead of replacing the shell.'],
    },
    productSpecificityPlan: {
      skeletonId: 'saas-dashboard',
      inferredDomain: 'delivery operations',
      targetUserRole: 'Engineering lead',
      primaryJobToBeDone: 'Know whether the team can ship the sprint without surprises.',
      domainEntities: [
        {
          id: 'risk',
          label: 'Risk',
          description: 'A project issue threatening sprint delivery.',
          fields: [
            { name: 'severity', type: 'string', example: 'High' },
            { name: 'owner', type: 'string', example: 'Pavel' },
          ],
          sampleNames: ['API timeout risk', 'Blocked dependency'],
        },
      ],
      productMetrics: [
        {
          id: 'velocity',
          label: 'Velocity',
          meaning: 'Points completed this sprint.',
          exampleValue: '34 points',
          shouldAppearOnScreens: ['dashboard'],
        },
      ],
      productStatuses: [
        {
          id: 'at-risk',
          label: 'At risk',
          meaning: 'The sprint may slip if the issue stays unresolved.',
          exampleUsage: 'Project Apollo is at risk.',
        },
      ],
      productActions: [
        {
          id: 'open-planning',
          label: 'Open weekly planning',
          userIntent: 'Launch the main sprint planning workflow.',
          expectedVisibleResult: 'The planning view opens with the chosen sprint.',
          shouldAppearOnScreens: ['dashboard'],
        },
      ],
      vocabulary: {
        preferredTerms: ['sprint health', 'risk radar', 'velocity'],
        avoidTerms: ['generic dashboard'],
        toneNotes: ['Clear and operational, not abstract.'],
      },
      screenSpecificContent: [
        {
          screenId: 'dashboard',
          concreteTitleSuggestions: ['Sprint health', 'Weekly delivery cockpit'],
          requiredEntities: ['sprint', 'risk'],
          requiredMetrics: ['velocity'],
          requiredActions: ['open-planning'],
          copyHints: ['Explain what changed this week.'],
          avoidOnThisScreen: ['placeholder metrics'],
        },
      ],
      sampleDataRules: ['Use real-seeming sprint names and point totals.'],
      copywritingRules: ['Prefer product-specific delivery language.'],
      forbiddenGenericPatterns: ['Feature 1', 'Feature 2'],
      specificityNotes: ['Keep the product anchored in weekly engineering rituals.'],
    },
  };
}

describe('ProductDocumentSet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds a structured PDS with non-empty checklist items and required fields', () => {
    const result = buildProductDocumentSet(createInput());

    expect(result.id).toBeTruthy();
    expect(result.projectId).toBe('project-sprintboard');
    expect(result.revisionId).toBe('revision-001');
    expect(result.runId).toBe('run-001');
    expect(result.generationPath).toBe('skeleton_assembly');
    expect(result.featureChecklist.length).toBeGreaterThan(0);
    expect(result.featureChecklist.some(item => item.priority === 'must')).toBe(true);

    for (const item of result.featureChecklist) {
      expect(item.id).toBeTruthy();
      expect(item.briefPoint).toBeTruthy();
      expect(['must', 'should', 'nice']).toContain(item.priority);
      expect(item.surface).toBeTruthy();
      expect(item.targetFiles.length).toBeGreaterThan(0);
      expect(item.acceptanceSignal.length).toBeGreaterThan(0);
      expect(item.codeSignals.length).toBeGreaterThan(0);
      expect(item.uiSignals.length).toBeGreaterThan(0);
      expect(item.dataSignals.length).toBeGreaterThan(0);
      expect(item.interactionSignals.length).toBeGreaterThan(0);
      expect(item.source.length).toBeGreaterThan(0);
    }
  });

  it('materializes the markdown bundle and structured JSON output', () => {
    const result = materializeProductDocumentSet(createInput());

    expect(result.baseDir).toBe('docs/architect');
    expect(result.files['docs/architect/product-document-set.json']).toContain('"featureChecklist"');
    expect(result.telemetry.built).toBe(true);
    expect(result.telemetry.saved).toBe(true);
    expect(result.telemetry.featureChecklistItemCount).toBe(result.productDocs.featureChecklist.length);

    for (const fileName of REQUIRED_MARKDOWN_FILES) {
      expect(result.productDocs.markdownBundle[fileName]).toBeTruthy();
      expect(result.productDocs.markdownBundle[fileName].trim().length).toBeGreaterThan(0);
      expect(result.files[`docs/architect/${fileName}`]).toBe(result.productDocs.markdownBundle[fileName]);
    }
  });

  it('serializes and deserializes the product docs without losing required sections', () => {
    const result = buildProductDocumentSet(createInput());
    const roundTrip = JSON.parse(JSON.stringify(result));

    expect(roundTrip.id).toBe(result.id);
    expect(roundTrip.featureChecklist.length).toBe(result.featureChecklist.length);
    expect(roundTrip.markdownBundle['vision.md']).toContain('SprintBoard');
    expect(roundTrip.markdownBundle['acceptance.md']).toContain('Must checklist items');
  });

  it('persists structured product docs outside generated files via ProjectStorage', () => {
    const materialized = materializeProductDocumentSet(createInput());
    const project: StoredProject = {
      id: 'stored-product-docs',
      name: 'SprintBoard',
      description: 'Weekly delivery cockpit',
      theme: 'warm-minimal',
      createdAt: '2026-06-18T10:00:00.000Z',
      updatedAt: '2026-06-18T10:00:00.000Z',
      files: materialized.files,
      chatHistory: [],
    };

    expect(ProjectStorage.saveProject(project)).toBe(true);

    const raw = localStorage.getItem('aic-proj-stored-product-docs');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.productDocs.id).toBe(materialized.productDocs.id);
    expect(parsed.productDocs.markdownBundle['implementation-brief.md']).toContain('Must Ship');

    const restored = ProjectStorage.getProject('stored-product-docs');
    expect(restored?.productDocs?.id).toBe(materialized.productDocs.id);
    expect(restored?.productDocs?.featureChecklist.length).toBeGreaterThan(0);
  });

  it('restores structured product docs from src-prefixed snapshot files used by normal generation runs', () => {
    const materialized = materializeProductDocumentSet(createInput());
    const srcPrefixedFiles = Object.fromEntries(
      Object.entries(materialized.files).map(([path, content]) => [`src/${path}`, content]),
    );

    expect(ProjectStorage.saveProject({
      id: 'stored-product-docs-src',
      name: 'SprintBoard',
      description: 'Weekly delivery cockpit',
      theme: 'warm-minimal',
      createdAt: '2026-06-18T10:00:00.000Z',
      updatedAt: '2026-06-18T10:00:00.000Z',
      files: srcPrefixedFiles,
      chatHistory: [],
    })).toBe(true);

    const restored = ProjectStorage.getProject('stored-product-docs-src');

    expect(restored?.productDocs?.id).toBe(materialized.productDocs.id);
    expect(restored?.productDocs?.markdownBundle['vision.md']).toContain('SprintBoard');
  });

  it('keeps old projects loadable when productDocs is absent', () => {
    const legacyProject = {
      id: 'legacy-project',
      name: 'Legacy Project',
      description: 'Pre-WI-2 project',
      theme: 'dark-slate',
      createdAt: '2026-06-18T09:00:00.000Z',
      updatedAt: '2026-06-18T09:00:00.000Z',
      files: {
        'App.tsx': 'export default function App() { return null; }',
      },
      chatHistory: [],
    };

    localStorage.setItem('aic-proj-legacy-project', JSON.stringify(legacyProject));

    const restored = ProjectStorage.getProject('legacy-project');

    expect(restored).not.toBeNull();
    expect(restored?.name).toBe('Legacy Project');
    expect(restored?.productDocs).toBeUndefined();
  });
});
