import type { ProjectPlan } from './types/ProjectPlan';
import type { SkeletonId } from './SkeletonRegistry';
import type { ScreenCompositionPlan } from './ScreenCompositionPlanner';
import type { FunctionalFlowPlan } from './FunctionalFlowPlanner';
import type { SkeletonIntegrationPlan } from './SkeletonIntegrationPlanner';
import type { ProductSpecificityPlan } from './ProductSpecificityPlanner';

export type ProductDocumentGenerationPath = 'skeleton_assembly' | 'blank_canvas';
export type ProductDocumentSetStatus = 'materialized';
export type ProductDocumentPersistenceTarget = 'project_snapshot' | 'project_storage' | 'run_report';

export interface ProductDocumentSetInput {
  prompt: string;
  generatedAt?: string;
  projectId?: string;
  revisionId?: string;
  runId?: string;
  generationPath?: ProductDocumentGenerationPath;
  skeletonId: SkeletonId;
  architectPlan: {
    appName: string;
    summary: string;
    pages?: Array<{ path: string; name: string; file: string; purpose: string }>;
    fileTree: Record<string, string>;
    notes?: string[];
    dataModel?: string;
    contextContract?: string;
  };
  prebuiltPlan?: ProjectPlan;
  compositionPlan?: ScreenCompositionPlan;
  functionalFlowPlan?: FunctionalFlowPlan;
  skeletonIntegrationPlan?: SkeletonIntegrationPlan;
  productSpecificityPlan?: ProductSpecificityPlan;
}

export interface ProductDocumentSource {
  kind: 'proto_pipeline' | 'saved_plan_pipeline';
  brief: string;
  skeletonId: SkeletonId;
  hasPrebuiltPlan: boolean;
  plannerArtifacts: string[];
}

export interface ProductVision {
  appName: string;
  summary: string;
  requestedBrief: string;
  description?: string;
  targetUser?: string;
  theme?: string;
  layoutType?: string;
  navigationPattern?: string;
  domain?: string;
  primaryJobToBeDone?: string;
  notes: string[];
  contextContract?: string;
}

export interface ProductPersona {
  id: string;
  name: string;
  role: string;
  needs: string[];
  contexts: string[];
  source: string[];
}

export interface FeatureChecklistItem {
  id: string;
  briefPoint: string;
  priority: 'must' | 'should' | 'nice';
  surface: string;
  targetFiles: string[];
  acceptanceSignal: string[];
  codeSignals: string[];
  uiSignals: string[];
  dataSignals: string[];
  interactionSignals: string[];
  source: string[];
}

export interface ProductScreenSpecEntry {
  id: string;
  title: string;
  routeHint?: string;
  file?: string;
  purpose?: string;
  role?: string;
  priority: 'must' | 'should' | 'nice';
  layoutIntent?: string;
  zones: string[];
  requiredInteractions: string[];
  stateRequirements: string[];
  contentRequirements: string[];
  source: string[];
}

export interface ProductScreenSpec {
  firstScreenId?: string;
  screens: ProductScreenSpecEntry[];
  globalLayoutRules: string[];
  compositionNotes: string[];
}

export interface ProductFunctionalFlow {
  id: string;
  title: string;
  screenId: string;
  userIntent: string;
  triggerElements: string[];
  stateChanges: string[];
  affectedEntities: string[];
  visibleFeedback: string[];
  navigationTarget?: string;
  requiredImplementation: string[];
}

export interface ProductFunctionalFlows {
  primaryUserGoal?: string;
  flows: ProductFunctionalFlow[];
  navigationRules: Array<{
    from: string;
    to: string;
    trigger: string;
    expectedBehavior: string;
  }>;
  globalStateRequirements: string[];
  nonDecorativeRules: string[];
  notes: string[];
}

export interface ProductDataEntity {
  id: string;
  label: string;
  fields: string[];
  examples: string[];
  source: string[];
}

export interface ProductDataModel {
  architectDataModelText?: string;
  sharedState?: string;
  entities: ProductDataEntity[];
  metrics: string[];
  statuses: string[];
}

export interface ProductDesignBrief {
  skeletonId: SkeletonId;
  skeletonFit?: string;
  skeletonFitReason?: string;
  reuseStrategy: string[];
  extensionStrategy: Array<{
    area: string;
    targetFiles: string[];
    reason: string;
  }>;
  codeQualityRules: string[];
  avoidPatterns: string[];
  toneNotes: string[];
  copywritingRules: string[];
  forbiddenGenericPatterns: string[];
  notes: string[];
}

export interface ProductUiInventory {
  routedScreens: Array<{
    id: string;
    title: string;
    routeHint?: string;
    file?: string;
  }>;
  deltaFileTree: Array<{
    path: string;
    purpose: string;
  }>;
  shadcnComponents: string[];
  icons: string[];
  customModules: Array<{
    id: string;
    recommendedPath: string;
    purpose: string;
    moduleType: string;
  }>;
  premiumTargets: string[];
}

export interface ProductDocumentSet {
  id: string;
  projectId: string;
  revisionId?: string;
  runId: string;
  generationPath: ProductDocumentGenerationPath;
  source: ProductDocumentSource;
  productVision: ProductVision;
  personas: ProductPersona[];
  featureChecklist: FeatureChecklistItem[];
  screenSpec: ProductScreenSpec;
  functionalFlows: ProductFunctionalFlows;
  dataModel: ProductDataModel;
  designBrief: ProductDesignBrief;
  uiInventory: ProductUiInventory;
  markdownBundle: Record<string, string>;
  status: ProductDocumentSetStatus;
  generatedAt: string;
  updatedAt: string;
}

export interface ProductDocumentSetTelemetry {
  built: boolean;
  saved: boolean;
  id: string;
  persistenceTarget: ProductDocumentPersistenceTarget;
  featureChecklistItemCount: number;
  featureChecklistMustCount: number;
  markdownBundleFiles: string[];
}

export interface ProductDocumentSetResult {
  baseDir: string;
  files: Record<string, string>;
  materializedFiles: string[];
  productDocs: ProductDocumentSet;
  telemetry: ProductDocumentSetTelemetry;
}

const PRODUCT_DOCS_DIR = 'docs/architect';
const PRODUCT_DOCS_JSON_PATH = `${PRODUCT_DOCS_DIR}/product-document-set.json`;
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

type ScreenSeed = {
  id: string;
  title: string;
  routeHint?: string;
  file?: string;
  purpose?: string;
  role?: string;
  priority: 'must' | 'should' | 'nice';
  layoutIntent?: string;
  zones: string[];
  requiredInteractions: string[];
  stateRequirements: string[];
  contentRequirements: string[];
  source: string[];
};

function normalizeDocTimestamp(value?: string): string {
  return value && value.trim() ? value : new Date().toISOString();
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

function hashText(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizePath(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\\/g, '/') : undefined;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map(value => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function sortStrings(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sortRecordEntries(record: Record<string, string>): Array<[string, string]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function collectRequiredCapabilityIds(prebuiltPlan?: ProjectPlan | null): string[] {
  if (!prebuiltPlan) return [];
  const kickoff = (prebuiltPlan.kickoffScope as { selectedCapabilityIds?: string[] } | undefined)?.selectedCapabilityIds ?? [];
  const architectKickoff = (prebuiltPlan.architectKickoff as { selectedCapabilityIds?: string[] } | undefined)?.selectedCapabilityIds ?? [];
  return sortStrings(uniqueStrings([...kickoff, ...architectKickoff]));
}

function priorityRank(priority: FeatureChecklistItem['priority']): number {
  switch (priority) {
    case 'must':
      return 0;
    case 'should':
      return 1;
    default:
      return 2;
  }
}

function sortChecklist(items: FeatureChecklistItem[]): FeatureChecklistItem[] {
  return [...items].sort((left, right) => (
    priorityRank(left.priority) - priorityRank(right.priority)
    || left.surface.localeCompare(right.surface)
    || left.briefPoint.localeCompare(right.briefPoint)
  ));
}

function ensureSignals(values: string[], fallback: string): string[] {
  const normalized = uniqueStrings(values);
  return normalized.length > 0 ? normalized : [fallback];
}

function buildPersonas(input: ProductDocumentSetInput): ProductPersona[] {
  const roleHints = uniqueStrings([
    input.productSpecificityPlan?.targetUserRole,
    input.prebuiltPlan?.targetUser,
    input.prebuiltPlan?.description,
  ]);

  if (roleHints.length === 0) {
    return [{
      id: 'persona-primary',
      name: 'Primary user',
      role: 'Primary user',
      needs: ['Complete the core product workflow without guesswork'],
      contexts: ['Derived from the requested brief and architect plan'],
      source: ['prompt', 'architectPlan.summary'],
    }];
  }

  return roleHints.map((role, index) => ({
    id: `persona-${index + 1}`,
    name: role.split(/[.,]/)[0] || `Persona ${index + 1}`,
    role,
    needs: uniqueStrings([
      input.productSpecificityPlan?.primaryJobToBeDone,
      input.architectPlan.summary,
    ]),
    contexts: uniqueStrings([
      input.prebuiltPlan?.description,
      input.productSpecificityPlan?.inferredDomain,
    ]),
    source: uniqueStrings([
      index === 0 ? 'productSpecificityPlan.targetUserRole' : 'prebuiltPlan.targetUser',
      'architectPlan.summary',
    ]),
  }));
}

function buildScreenSpec(input: ProductDocumentSetInput): ProductScreenSpec {
  const screenMap = new Map<string, ScreenSeed>();

  const upsertScreen = (seed: ScreenSeed) => {
    const key = normalizePath(seed.file) ?? seed.routeHint ?? seed.id;
    const existing = screenMap.get(key);
    if (!existing) {
      screenMap.set(key, {
        ...seed,
        file: normalizePath(seed.file),
        routeHint: normalizePath(seed.routeHint),
        zones: sortStrings(seed.zones),
        requiredInteractions: sortStrings(seed.requiredInteractions),
        stateRequirements: sortStrings(seed.stateRequirements),
        contentRequirements: sortStrings(seed.contentRequirements),
        source: sortStrings(seed.source),
      });
      return;
    }

    const rank = (priority: ScreenSeed['priority']) => (
      priority === 'must' ? 0 : priority === 'should' ? 1 : 2
    );
    const nextPriority = rank(seed.priority) < rank(existing.priority) ? seed.priority : existing.priority;

    screenMap.set(key, {
      ...existing,
      id: existing.id || seed.id,
      title: existing.title || seed.title,
      routeHint: existing.routeHint || normalizePath(seed.routeHint),
      file: existing.file || normalizePath(seed.file),
      purpose: existing.purpose || seed.purpose,
      role: existing.role || seed.role,
      priority: nextPriority,
      layoutIntent: existing.layoutIntent || seed.layoutIntent,
      zones: sortStrings([...existing.zones, ...seed.zones]),
      requiredInteractions: sortStrings([...existing.requiredInteractions, ...seed.requiredInteractions]),
      stateRequirements: sortStrings([...existing.stateRequirements, ...seed.stateRequirements]),
      contentRequirements: sortStrings([...existing.contentRequirements, ...seed.contentRequirements]),
      source: sortStrings([...existing.source, ...seed.source]),
    });
  };

  for (const page of input.prebuiltPlan?.pages ?? []) {
    upsertScreen({
      id: slugify(page.name || page.path || page.file || 'screen'),
      title: page.name || page.path || page.file,
      routeHint: page.path,
      file: page.file,
      purpose: page.purpose,
      priority: page.isMainScreen ? 'must' : 'should',
      layoutIntent: page.uiSpec,
      zones: page.keyElements ?? [],
      requiredInteractions: [],
      stateRequirements: [],
      contentRequirements: [page.purpose],
      source: ['prebuiltPlan.pages'],
    });
  }

  for (const page of input.architectPlan.pages ?? []) {
    upsertScreen({
      id: slugify(page.name || page.path || page.file || 'screen'),
      title: page.name || page.path || page.file,
      routeHint: page.path,
      file: page.file,
      purpose: page.purpose,
      priority: 'should',
      zones: [],
      requiredInteractions: [],
      stateRequirements: [],
      contentRequirements: [page.purpose],
      source: ['architectPlan.pages'],
    });
  }

  for (const screen of input.compositionPlan?.screens ?? []) {
    upsertScreen({
      id: screen.id,
      title: screen.title,
      routeHint: screen.routeHint,
      purpose: screen.layoutIntent,
      role: screen.role,
      priority: screen.priority === 'primary' ? 'must' : 'should',
      layoutIntent: screen.layoutIntent,
      zones: screen.zones.map(zone => `${zone.role}: ${zone.intent}`),
      requiredInteractions: screen.requiredInteractions,
      stateRequirements: screen.stateRequirements,
      contentRequirements: screen.contentRequirements,
      source: ['screenCompositionPlan.screens'],
    });
  }

  const screens = [...screenMap.values()]
    .map(screen => ({
      ...screen,
      zones: sortStrings(screen.zones),
      requiredInteractions: sortStrings(screen.requiredInteractions),
      stateRequirements: sortStrings(screen.stateRequirements),
      contentRequirements: sortStrings(screen.contentRequirements),
      source: sortStrings(screen.source),
    }))
    .sort((left, right) => (
      priorityRank(left.priority) - priorityRank(right.priority)
      || left.title.localeCompare(right.title)
    ));

  return {
    firstScreenId: input.compositionPlan?.firstScreenId ?? screens[0]?.id,
    screens,
    globalLayoutRules: sortStrings(input.compositionPlan?.globalLayoutRules ?? []),
    compositionNotes: sortStrings(input.compositionPlan?.compositionNotes ?? []),
  };
}

function buildFunctionalFlows(input: ProductDocumentSetInput): ProductFunctionalFlows {
  return {
    primaryUserGoal: input.functionalFlowPlan?.primaryUserGoal,
    flows: (input.functionalFlowPlan?.flows ?? [])
      .map(flow => ({
        id: flow.id,
        title: flow.title,
        screenId: flow.screenId,
        userIntent: flow.userIntent,
        triggerElements: sortStrings(flow.triggerElements),
        stateChanges: sortStrings(flow.stateChanges),
        affectedEntities: sortStrings(flow.affectedEntities),
        visibleFeedback: sortStrings(flow.visibleFeedback),
        navigationTarget: flow.navigationTarget,
        requiredImplementation: sortStrings(flow.requiredImplementation),
      }))
      .sort((left, right) => left.title.localeCompare(right.title)),
    navigationRules: [...(input.functionalFlowPlan?.navigationRules ?? [])]
      .sort((left, right) => (
        left.from.localeCompare(right.from)
        || left.to.localeCompare(right.to)
      )),
    globalStateRequirements: sortStrings(input.functionalFlowPlan?.globalStateRequirements ?? []),
    nonDecorativeRules: sortStrings(input.functionalFlowPlan?.nonDecorativeRules ?? []),
    notes: sortStrings(input.functionalFlowPlan?.functionalNotes ?? []),
  };
}

function buildDataModel(input: ProductDocumentSetInput): ProductDataModel {
  const entityMap = new Map<string, ProductDataEntity>();

  const upsertEntity = (
    id: string,
    label: string,
    fields: string[],
    examples: string[],
    source: string,
  ) => {
    const key = slugify(id || label || source || 'entity');
    const existing = entityMap.get(key);
    if (!existing) {
      entityMap.set(key, {
        id: key,
        label: label || id || 'Entity',
        fields: sortStrings(fields),
        examples: sortStrings(examples),
        source: [source],
      });
      return;
    }

    entityMap.set(key, {
      ...existing,
      label: existing.label || label,
      fields: sortStrings([...existing.fields, ...fields]),
      examples: sortStrings([...existing.examples, ...examples]),
      source: sortStrings([...existing.source, source]),
    });
  };

  for (const entity of input.prebuiltPlan?.dataModel?.entities ?? []) {
    upsertEntity(
      entity.name,
      entity.name,
      entity.fields
        .split(',')
        .map(field => field.trim())
        .filter(Boolean),
      [],
      'prebuiltPlan.dataModel.entities',
    );
  }

  for (const entity of input.functionalFlowPlan?.entities ?? []) {
    upsertEntity(
      entity.id,
      entity.label,
      entity.fields.map(field => `${field.name}: ${field.type}`),
      entity.fields.map(field => field.example),
      'functionalFlowPlan.entities',
    );
  }

  for (const entity of input.productSpecificityPlan?.domainEntities ?? []) {
    upsertEntity(
      entity.id,
      entity.label,
      entity.fields.map(field => `${field.name}: ${field.type}`),
      entity.sampleNames,
      'productSpecificityPlan.domainEntities',
    );
  }

  return {
    architectDataModelText: input.architectPlan.dataModel,
    sharedState: input.prebuiltPlan?.dataModel?.sharedState,
    entities: [...entityMap.values()].sort((left, right) => left.label.localeCompare(right.label)),
    metrics: sortStrings((input.productSpecificityPlan?.productMetrics ?? []).map(metric => metric.label)),
    statuses: sortStrings((input.productSpecificityPlan?.productStatuses ?? []).map(status => status.label)),
  };
}

function buildDesignBrief(input: ProductDocumentSetInput): ProductDesignBrief {
  return {
    skeletonId: input.skeletonId,
    skeletonFit: input.skeletonIntegrationPlan?.skeletonFit,
    skeletonFitReason: input.skeletonIntegrationPlan?.skeletonFitReason,
    reuseStrategy: sortStrings(
      (input.skeletonIntegrationPlan?.reuseStrategy ?? [])
        .map(strategy => `${strategy.area}: ${strategy.reuseMode} (${strategy.reason})`),
    ),
    extensionStrategy: (input.skeletonIntegrationPlan?.extensionStrategy ?? [])
      .map(strategy => ({
        area: strategy.area,
        targetFiles: sortStrings(strategy.targetFiles.map(path => normalizePath(path) ?? path)),
        reason: strategy.reason,
      }))
      .sort((left, right) => left.area.localeCompare(right.area)),
    codeQualityRules: sortStrings(input.skeletonIntegrationPlan?.codeQualityRules ?? []),
    avoidPatterns: sortStrings([
      ...(input.compositionPlan?.avoidPatterns ?? []),
      ...(input.skeletonIntegrationPlan?.forbiddenPatterns ?? []),
    ]),
    toneNotes: sortStrings(input.productSpecificityPlan?.vocabulary.toneNotes ?? []),
    copywritingRules: sortStrings(input.productSpecificityPlan?.copywritingRules ?? []),
    forbiddenGenericPatterns: sortStrings(input.productSpecificityPlan?.forbiddenGenericPatterns ?? []),
    notes: sortStrings([
      ...(input.skeletonIntegrationPlan?.integrationNotes ?? []),
      ...(input.productSpecificityPlan?.specificityNotes ?? []),
    ]),
  };
}

function buildUiInventory(input: ProductDocumentSetInput, screenSpec: ProductScreenSpec): ProductUiInventory {
  return {
    routedScreens: screenSpec.screens.map(screen => ({
      id: screen.id,
      title: screen.title,
      routeHint: screen.routeHint,
      file: screen.file,
    })),
    deltaFileTree: sortRecordEntries(input.architectPlan.fileTree).map(([path, purpose]) => ({
      path: normalizePath(path) ?? path,
      purpose,
    })),
    shadcnComponents: sortStrings(input.prebuiltPlan?.shadcnComponents ?? []),
    icons: sortStrings(input.prebuiltPlan?.icons ?? []),
    customModules: (input.skeletonIntegrationPlan?.customModules ?? [])
      .map(module => ({
        id: module.id,
        recommendedPath: normalizePath(module.recommendedPath) ?? module.recommendedPath,
        purpose: module.purpose,
        moduleType: module.moduleType,
      }))
      .sort((left, right) => left.recommendedPath.localeCompare(right.recommendedPath)),
    premiumTargets: sortStrings(
      (input.compositionPlan?.screens ?? []).flatMap(screen => screen.premiumComponentTargets ?? []),
    ),
  };
}

function buildFeatureChecklist(input: ProductDocumentSetInput, screenSpec: ProductScreenSpec, functionalFlows: ProductFunctionalFlows, dataModel: ProductDataModel, designBrief: ProductDesignBrief): FeatureChecklistItem[] {
  const items: FeatureChecklistItem[] = [];
  const capabilityIds = collectRequiredCapabilityIds(input.prebuiltPlan);
  const defaultTargetFiles = screenSpec.screens
    .map(screen => screen.file)
    .filter((value): value is string => Boolean(value))
    .slice(0, 4);
  const fallbackTargetFiles = defaultTargetFiles.length > 0
    ? defaultTargetFiles
    : sortRecordEntries(input.architectPlan.fileTree).map(([path]) => path).slice(0, 4);

  for (const screen of screenSpec.screens) {
    items.push({
      id: `screen-${hashText(`${screen.id}|${screen.file ?? screen.routeHint ?? screen.title}`)}`,
      briefPoint: `${screen.title} ships as a concrete product surface`,
      priority: screen.priority,
      surface: screen.title,
      targetFiles: ensureSignals(uniqueStrings([screen.file]), 'App.tsx'),
      acceptanceSignal: ensureSignals(
        uniqueStrings([
          screen.purpose,
          screen.layoutIntent,
          `Route ${screen.routeHint ?? screen.id} renders meaningful product content`,
        ]),
        'The screen is visible and meaningful in the shipped prototype.',
      ),
      codeSignals: ensureSignals(
        uniqueStrings([screen.file, ...screen.source]),
        'A concrete routed implementation file exists.',
      ),
      uiSignals: ensureSignals(
        [...screen.zones, ...screen.contentRequirements],
        'The surface shows product-specific UI instead of placeholders.',
      ),
      dataSignals: ensureSignals(
        screen.stateRequirements,
        'Local state or mock data is wired for the surface.',
      ),
      interactionSignals: ensureSignals(
        screen.requiredInteractions,
        'Primary actions change visible state on the surface.',
      ),
      source: ensureSignals(screen.source, 'screenSpec'),
    });
  }

  for (const flow of functionalFlows.flows) {
    items.push({
      id: `flow-${hashText(`${flow.id}|${flow.screenId}|${flow.title}`)}`,
      briefPoint: `${flow.title} is implemented end-to-end`,
      priority: 'must',
      surface: flow.screenId,
      targetFiles: fallbackTargetFiles.length > 0 ? fallbackTargetFiles : ['App.tsx'],
      acceptanceSignal: ensureSignals(
        [...flow.requiredImplementation, ...flow.visibleFeedback],
        'The flow completes with visible feedback.',
      ),
      codeSignals: ensureSignals(
        [...flow.requiredImplementation, ...flow.stateChanges],
        'State transitions are implemented in code.',
      ),
      uiSignals: ensureSignals(
        flow.visibleFeedback,
        'The UI communicates the result of the user action.',
      ),
      dataSignals: ensureSignals(
        [...flow.affectedEntities, ...flow.stateChanges],
        'Local data updates reflect the flow outcome.',
      ),
      interactionSignals: ensureSignals(
        flow.triggerElements,
        'A visible control triggers the flow.',
      ),
      source: ['functionalFlowPlan.flows'],
    });
  }

  for (const capabilityId of capabilityIds) {
    items.push({
      id: `capability-${slugify(capabilityId)}`,
      briefPoint: `Must-capability "${capabilityId}" is visible in the shipped prototype`,
      priority: 'must',
      surface: capabilityId,
      targetFiles: fallbackTargetFiles.length > 0 ? fallbackTargetFiles : ['App.tsx'],
      acceptanceSignal: [
        `The prototype makes the "${capabilityId}" capability testable without reading notes.`,
      ],
      codeSignals: [
        `Implementation contains concrete code paths for ${capabilityId}.`,
      ],
      uiSignals: [
        `The UI exposes ${capabilityId} through visible product affordances.`,
      ],
      dataSignals: [
        `Local data or state reflects the ${capabilityId} capability.`,
      ],
      interactionSignals: [
        `A user action can trigger or inspect ${capabilityId}.`,
      ],
      source: ['prebuiltPlan.kickoffScope.selectedCapabilityIds'],
    });
  }

  for (const entity of dataModel.entities.slice(0, 3)) {
    items.push({
      id: `entity-${entity.id}`,
      briefPoint: `${entity.label} is represented in mock data and UI copy`,
      priority: 'should',
      surface: entity.label,
      targetFiles: fallbackTargetFiles.length > 0 ? fallbackTargetFiles : ['App.tsx'],
      acceptanceSignal: [
        `${entity.label} appears in the product as structured mock data or derived state.`,
      ],
      codeSignals: ensureSignals(entity.fields, 'The entity has named fields in the code.'),
      uiSignals: [
        `${entity.label} labels and details are visible in the UI.`,
      ],
      dataSignals: ensureSignals(entity.examples, 'Example values exist for the entity.'),
      interactionSignals: [
        `At least one flow reads or updates ${entity.label}.`,
      ],
      source: entity.source,
    });
  }

  items.push({
    id: `design-${hashText(`${input.skeletonId}|${designBrief.skeletonFit ?? 'unknown'}`)}`,
    briefPoint: 'The prototype follows the selected skeleton and design brief',
    priority: 'should',
    surface: 'design-system',
    targetFiles: fallbackTargetFiles.length > 0 ? fallbackTargetFiles : ['App.tsx'],
    acceptanceSignal: ensureSignals(
      uniqueStrings([designBrief.skeletonFitReason, ...designBrief.notes.slice(0, 2)]),
      'The selected skeleton remains the product foundation.',
    ),
    codeSignals: ensureSignals(
      designBrief.codeQualityRules.slice(0, 3),
      'Code respects the selected skeleton boundaries.',
    ),
    uiSignals: ensureSignals(
      [...designBrief.toneNotes.slice(0, 2), ...designBrief.copywritingRules.slice(0, 2)],
      'The UI matches the requested design direction.',
    ),
    dataSignals: [
      'Content stays product-specific and avoids generic placeholder language.',
    ],
    interactionSignals: [
      'Core interactions remain consistent with the selected skeleton patterns.',
    ],
    source: ['skeletonIntegrationPlan', 'productSpecificityPlan'],
  });

  if (items.length === 0) {
    items.push({
      id: `fallback-${hashText(input.prompt)}`,
      briefPoint: 'Ship a concrete prototype for the requested brief',
      priority: 'must',
      surface: input.architectPlan.appName || 'prototype',
      targetFiles: fallbackTargetFiles.length > 0 ? fallbackTargetFiles : ['App.tsx'],
      acceptanceSignal: ['The prototype is testable without relying on notes-only explanations.'],
      codeSignals: ['Core implementation files exist and compile.'],
      uiSignals: ['The UI contains product-specific content.'],
      dataSignals: ['Local state or mock data is present.'],
      interactionSignals: ['Primary actions change visible state.'],
      source: ['prompt'],
    });
  }

  return sortChecklist(items);
}

function buildVisionMarkdown(productDocs: Omit<ProductDocumentSet, 'markdownBundle'>): string {
  const lines = [
    `# ${productDocs.productVision.appName}`,
    '',
    `- Product docs id: \`${productDocs.id}\``,
    `- Project id: \`${productDocs.projectId}\``,
    `- Run id: \`${productDocs.runId}\``,
    `- Generation path: \`${productDocs.generationPath}\``,
    '',
    '## Summary',
    '',
    productDocs.productVision.summary,
    '',
    '## Requested Brief',
    '',
    productDocs.productVision.requestedBrief,
    '',
    '## Product Shape',
    '',
    `- Theme: ${productDocs.productVision.theme ?? 'not specified'}`,
    `- Layout: ${productDocs.productVision.layoutType ?? 'not specified'}`,
    `- Navigation: ${productDocs.productVision.navigationPattern ?? 'not specified'}`,
    `- Target user: ${productDocs.productVision.targetUser ?? 'not specified'}`,
    `- Domain: ${productDocs.productVision.domain ?? 'not specified'}`,
    `- Primary job to be done: ${productDocs.productVision.primaryJobToBeDone ?? 'not specified'}`,
    '',
    '## Personas',
    '',
    ...productDocs.personas.flatMap(persona => [
      `### ${persona.name}`,
      '',
      `- Role: ${persona.role}`,
      `- Needs: ${persona.needs.join('; ') || 'not specified'}`,
      `- Context: ${persona.contexts.join('; ') || 'not specified'}`,
      `- Source: ${persona.source.join(', ')}`,
      '',
    ]),
  ];

  if (productDocs.productVision.notes.length > 0) {
    lines.push('## Notes', '', ...productDocs.productVision.notes.map(note => `- ${note}`), '');
  }

  if (productDocs.productVision.contextContract) {
    lines.push('## Context Contract', '', '```text', productDocs.productVision.contextContract, '```', '');
  }

  return lines.join('\n').trim() + '\n';
}

function buildFeatureChecklistMarkdown(productDocs: Omit<ProductDocumentSet, 'markdownBundle'>): string {
  const lines = [
    '# Feature Checklist',
    '',
    `Total items: ${productDocs.featureChecklist.length}`,
    `Must items: ${productDocs.featureChecklist.filter(item => item.priority === 'must').length}`,
    '',
  ];

  for (const item of productDocs.featureChecklist) {
    lines.push(
      `## ${item.briefPoint}`,
      '',
      `- Priority: ${item.priority}`,
      `- Surface: ${item.surface}`,
      `- Target files: ${item.targetFiles.join(', ')}`,
      `- Acceptance: ${item.acceptanceSignal.join('; ')}`,
      `- Code signals: ${item.codeSignals.join('; ')}`,
      `- UI signals: ${item.uiSignals.join('; ')}`,
      `- Data signals: ${item.dataSignals.join('; ')}`,
      `- Interaction signals: ${item.interactionSignals.join('; ')}`,
      `- Source: ${item.source.join(', ')}`,
      '',
    );
  }

  return lines.join('\n').trim() + '\n';
}

function buildScreensMarkdown(productDocs: Omit<ProductDocumentSet, 'markdownBundle'>): string {
  const lines = [
    '# Screens',
    '',
    `First screen id: ${productDocs.screenSpec.firstScreenId ?? 'not specified'}`,
    '',
  ];

  for (const screen of productDocs.screenSpec.screens) {
    lines.push(
      `## ${screen.title}`,
      '',
      `- Id: ${screen.id}`,
      `- Priority: ${screen.priority}`,
      `- Route: ${screen.routeHint ?? 'not specified'}`,
      `- File: ${screen.file ?? 'not specified'}`,
      `- Role: ${screen.role ?? 'not specified'}`,
      `- Purpose: ${screen.purpose ?? screen.layoutIntent ?? 'not specified'}`,
      `- Zones: ${screen.zones.join('; ') || 'not specified'}`,
      `- Required interactions: ${screen.requiredInteractions.join('; ') || 'not specified'}`,
      `- State requirements: ${screen.stateRequirements.join('; ') || 'not specified'}`,
      `- Content requirements: ${screen.contentRequirements.join('; ') || 'not specified'}`,
      `- Source: ${screen.source.join(', ')}`,
      '',
    );
  }

  if (productDocs.screenSpec.globalLayoutRules.length > 0) {
    lines.push('## Global Layout Rules', '', ...productDocs.screenSpec.globalLayoutRules.map(rule => `- ${rule}`), '');
  }

  if (productDocs.screenSpec.compositionNotes.length > 0) {
    lines.push('## Composition Notes', '', ...productDocs.screenSpec.compositionNotes.map(note => `- ${note}`), '');
  }

  return lines.join('\n').trim() + '\n';
}

function buildFlowsMarkdown(productDocs: Omit<ProductDocumentSet, 'markdownBundle'>): string {
  const lines = [
    '# Functional Flows',
    '',
    `Primary user goal: ${productDocs.functionalFlows.primaryUserGoal ?? 'not specified'}`,
    '',
  ];

  for (const flow of productDocs.functionalFlows.flows) {
    lines.push(
      `## ${flow.title}`,
      '',
      `- Screen id: ${flow.screenId}`,
      `- User intent: ${flow.userIntent}`,
      `- Trigger elements: ${flow.triggerElements.join('; ') || 'not specified'}`,
      `- State changes: ${flow.stateChanges.join('; ') || 'not specified'}`,
      `- Affected entities: ${flow.affectedEntities.join('; ') || 'not specified'}`,
      `- Visible feedback: ${flow.visibleFeedback.join('; ') || 'not specified'}`,
      `- Navigation target: ${flow.navigationTarget ?? 'not specified'}`,
      `- Required implementation: ${flow.requiredImplementation.join('; ') || 'not specified'}`,
      '',
    );
  }

  if (productDocs.functionalFlows.navigationRules.length > 0) {
    lines.push('## Navigation Rules', '');
    for (const rule of productDocs.functionalFlows.navigationRules) {
      lines.push(`- ${rule.from} -> ${rule.to} via ${rule.trigger}: ${rule.expectedBehavior}`);
    }
    lines.push('');
  }

  if (productDocs.functionalFlows.globalStateRequirements.length > 0) {
    lines.push('## Global State Requirements', '', ...productDocs.functionalFlows.globalStateRequirements.map(rule => `- ${rule}`), '');
  }

  if (productDocs.functionalFlows.nonDecorativeRules.length > 0) {
    lines.push('## Non-decorative Rules', '', ...productDocs.functionalFlows.nonDecorativeRules.map(rule => `- ${rule}`), '');
  }

  return lines.join('\n').trim() + '\n';
}

function buildDataModelMarkdown(productDocs: Omit<ProductDocumentSet, 'markdownBundle'>): string {
  const lines = ['# Data Model', ''];

  if (productDocs.dataModel.architectDataModelText) {
    lines.push('## Architect Data Model', '', productDocs.dataModel.architectDataModelText, '');
  }

  if (productDocs.dataModel.sharedState) {
    lines.push('## Shared State', '', productDocs.dataModel.sharedState, '');
  }

  if (productDocs.dataModel.entities.length > 0) {
    lines.push('## Entities', '');
    for (const entity of productDocs.dataModel.entities) {
      lines.push(
        `### ${entity.label}`,
        '',
        `- Fields: ${entity.fields.join('; ') || 'not specified'}`,
        `- Examples: ${entity.examples.join('; ') || 'not specified'}`,
        `- Source: ${entity.source.join(', ')}`,
        '',
      );
    }
  } else {
    lines.push('No structured entities were captured, but the prototype should still expose meaningful local state.', '');
  }

  lines.push(
    '## Metrics',
    '',
    productDocs.dataModel.metrics.length > 0
      ? productDocs.dataModel.metrics.map(metric => `- ${metric}`).join('\n')
      : '- No explicit metrics were captured',
    '',
    '## Statuses',
    '',
    productDocs.dataModel.statuses.length > 0
      ? productDocs.dataModel.statuses.map(status => `- ${status}`).join('\n')
      : '- No explicit statuses were captured',
    '',
  );

  return lines.join('\n').trim() + '\n';
}

function buildDesignBriefMarkdown(productDocs: Omit<ProductDocumentSet, 'markdownBundle'>): string {
  const lines = [
    '# Design Brief',
    '',
    `- Skeleton id: ${productDocs.designBrief.skeletonId}`,
    `- Skeleton fit: ${productDocs.designBrief.skeletonFit ?? 'not specified'}`,
    `- Skeleton fit reason: ${productDocs.designBrief.skeletonFitReason ?? 'not specified'}`,
    '',
  ];

  lines.push(
    '## Reuse Strategy',
    '',
    productDocs.designBrief.reuseStrategy.length > 0
      ? productDocs.designBrief.reuseStrategy.map(item => `- ${item}`).join('\n')
      : '- No reuse strategy captured',
    '',
    '## Extension Strategy',
    '',
  );

  if (productDocs.designBrief.extensionStrategy.length > 0) {
    for (const item of productDocs.designBrief.extensionStrategy) {
      lines.push(`- ${item.area}: ${item.targetFiles.join(', ') || 'no files'} (${item.reason})`);
    }
  } else {
    lines.push('- No extension strategy captured');
  }

  lines.push(
    '',
    '## Code Quality Rules',
    '',
    productDocs.designBrief.codeQualityRules.length > 0
      ? productDocs.designBrief.codeQualityRules.map(rule => `- ${rule}`).join('\n')
      : '- No explicit code quality rules captured',
    '',
    '## Avoid Patterns',
    '',
    productDocs.designBrief.avoidPatterns.length > 0
      ? productDocs.designBrief.avoidPatterns.map(rule => `- ${rule}`).join('\n')
      : '- No avoid patterns captured',
    '',
    '## Tone Notes',
    '',
    productDocs.designBrief.toneNotes.length > 0
      ? productDocs.designBrief.toneNotes.map(note => `- ${note}`).join('\n')
      : '- No tone notes captured',
    '',
    '## Copywriting Rules',
    '',
    productDocs.designBrief.copywritingRules.length > 0
      ? productDocs.designBrief.copywritingRules.map(rule => `- ${rule}`).join('\n')
      : '- No copywriting rules captured',
    '',
  );

  return lines.join('\n').trim() + '\n';
}

function buildImplementationBriefMarkdown(productDocs: Omit<ProductDocumentSet, 'markdownBundle'>): string {
  const mustCapabilities = productDocs.featureChecklist
    .filter(item => item.priority === 'must')
    .map(item => item.briefPoint);

  const lines = [
    '# Implementation Brief',
    '',
    `- Product docs id: \`${productDocs.id}\``,
    `- Status: \`${productDocs.status}\``,
    `- Generated at: ${productDocs.generatedAt}`,
    '',
    '## Must Ship',
    '',
    mustCapabilities.length > 0
      ? mustCapabilities.map(item => `- ${item}`).join('\n')
      : '- No explicit must items were captured',
    '',
    '## Routed Screens',
    '',
  ];

  if (productDocs.uiInventory.routedScreens.length > 0) {
    for (const screen of productDocs.uiInventory.routedScreens) {
      lines.push(`- ${screen.title} -> ${screen.routeHint ?? screen.id} (${screen.file ?? 'no file captured'})`);
    }
  } else {
    lines.push('- No routed screens captured');
  }

  lines.push(
    '',
    '## Delta File Tree',
    '',
  );

  if (productDocs.uiInventory.deltaFileTree.length > 0) {
    for (const entry of productDocs.uiInventory.deltaFileTree) {
      lines.push(`- ${entry.path}: ${entry.purpose}`);
    }
  } else {
    lines.push('- No delta file tree captured');
  }

  lines.push(
    '',
    '## UI Inventory',
    '',
    `- shadcn components: ${productDocs.uiInventory.shadcnComponents.join(', ') || 'none'}`,
    `- icons: ${productDocs.uiInventory.icons.join(', ') || 'none'}`,
    `- premium targets: ${productDocs.uiInventory.premiumTargets.join(', ') || 'none'}`,
    '',
  );

  if (productDocs.uiInventory.customModules.length > 0) {
    lines.push('## Custom Modules', '');
    for (const module of productDocs.uiInventory.customModules) {
      lines.push(`- ${module.recommendedPath}: ${module.purpose} (${module.moduleType})`);
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}

function buildAcceptanceMarkdown(productDocs: Omit<ProductDocumentSet, 'markdownBundle'>): string {
  const mustItems = productDocs.featureChecklist.filter(item => item.priority === 'must');
  const lines = [
    '# Acceptance',
    '',
    `- Total checklist items: ${productDocs.featureChecklist.length}`,
    `- Must checklist items: ${mustItems.length}`,
    `- Structured persistence target: run_telemetry`,
    '',
    '## Must Feature Signals',
    '',
  ];

  if (mustItems.length > 0) {
    for (const item of mustItems) {
      lines.push(`- ${item.briefPoint}: ${item.acceptanceSignal.join('; ')}`);
    }
  } else {
    lines.push('- No explicit must items were captured');
  }

  lines.push(
    '',
    '## Bundle Files',
    '',
    ...REQUIRED_MARKDOWN_FILES.map(fileName => `- ${fileName}`),
    '',
  );

  return lines.join('\n').trim() + '\n';
}

function buildMarkdownBundle(productDocs: Omit<ProductDocumentSet, 'markdownBundle'>): Record<string, string> {
  const bundle: Record<string, string> = {
    'vision.md': buildVisionMarkdown(productDocs),
    'feature-checklist.md': buildFeatureChecklistMarkdown(productDocs),
    'screens.md': buildScreensMarkdown(productDocs),
    'flows.md': buildFlowsMarkdown(productDocs),
    'data-model.md': buildDataModelMarkdown(productDocs),
    'design-brief.md': buildDesignBriefMarkdown(productDocs),
    'implementation-brief.md': buildImplementationBriefMarkdown(productDocs),
    'acceptance.md': buildAcceptanceMarkdown(productDocs),
  };

  for (const fileName of REQUIRED_MARKDOWN_FILES) {
    if (!bundle[fileName]?.trim()) {
      bundle[fileName] = `# ${fileName}\n\nNo content captured.\n`;
    }
  }

  return Object.fromEntries(
    Object.entries(bundle).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildProductDocumentSet(input: ProductDocumentSetInput): ProductDocumentSet {
  const generatedAt = normalizeDocTimestamp(input.generatedAt);
  const screenSpec = buildScreenSpec(input);
  const functionalFlows = buildFunctionalFlows(input);
  const dataModel = buildDataModel(input);
  const designBrief = buildDesignBrief(input);
  const uiInventory = buildUiInventory(input, screenSpec);
  const personas = buildPersonas(input);
  const projectId = input.projectId?.trim()
    || `preview-${slugify(input.architectPlan.appName || input.skeletonId) || 'project'}`;
  const runIdSeed = uniqueStrings([
    input.runId,
    input.revisionId,
    input.architectPlan.appName,
    input.prompt,
    input.skeletonId,
  ]).join('|');
  const runId = input.runId?.trim() || `run-${hashText(runIdSeed)}`;
  const draftId = `pds-${slugify(input.architectPlan.appName || input.skeletonId) || 'product'}-${hashText([
    projectId,
    input.revisionId ?? '',
    runId,
    input.skeletonId,
    input.prompt,
    input.architectPlan.summary,
  ].join('|'))}`;

  const productVision: ProductVision = {
    appName: input.architectPlan.appName,
    summary: input.architectPlan.summary || input.prompt,
    requestedBrief: input.prompt,
    description: input.prebuiltPlan?.description,
    targetUser: input.prebuiltPlan?.targetUser,
    theme: input.prebuiltPlan?.theme,
    layoutType: input.prebuiltPlan?.layout.type,
    navigationPattern: input.prebuiltPlan?.layout.navigation,
    domain: input.productSpecificityPlan?.inferredDomain,
    primaryJobToBeDone: input.productSpecificityPlan?.primaryJobToBeDone,
    notes: sortStrings(input.architectPlan.notes ?? []),
    contextContract: input.architectPlan.contextContract,
  };

  const featureChecklist = buildFeatureChecklist(input, screenSpec, functionalFlows, dataModel, designBrief);

  const baseDoc: Omit<ProductDocumentSet, 'markdownBundle'> = {
    id: draftId,
    projectId,
    revisionId: input.revisionId?.trim() || undefined,
    runId,
    generationPath: input.generationPath ?? 'skeleton_assembly',
    source: {
      kind: input.prebuiltPlan ? 'saved_plan_pipeline' : 'proto_pipeline',
      brief: input.prompt,
      skeletonId: input.skeletonId,
      hasPrebuiltPlan: Boolean(input.prebuiltPlan),
      plannerArtifacts: sortStrings([
        input.prebuiltPlan ? 'prebuiltPlan' : '',
        input.compositionPlan ? 'screenCompositionPlan' : '',
        input.functionalFlowPlan ? 'functionalFlowPlan' : '',
        input.skeletonIntegrationPlan ? 'skeletonIntegrationPlan' : '',
        input.productSpecificityPlan ? 'productSpecificityPlan' : '',
      ]),
    },
    productVision,
    personas,
    featureChecklist,
    screenSpec,
    functionalFlows,
    dataModel,
    designBrief,
    uiInventory,
    status: 'materialized',
    generatedAt,
    updatedAt: generatedAt,
  };

  return {
    ...baseDoc,
    markdownBundle: buildMarkdownBundle(baseDoc),
  };
}

export function materializeProductDocumentSet(
  input: ProductDocumentSetInput,
): ProductDocumentSetResult {
  const productDocs = buildProductDocumentSet(input);
  const baseDir = PRODUCT_DOCS_DIR;
  const files: Record<string, string> = {
    [`${baseDir}/README.md`]: [
      '# Product Document Set',
      '',
      'This folder captures the deterministic product-doc bundle assembled before implementation.',
      '',
      '- `product-document-set.json` — structured source of truth for the batch',
      '- `vision.md` — product vision and personas',
      '- `feature-checklist.md` — must/should/nice feature contract',
      '- `screens.md` — screen-by-screen brief',
      '- `flows.md` — functional flows and navigation rules',
      '- `data-model.md` — entities, metrics, and statuses',
      '- `design-brief.md` — skeleton fit, guardrails, and design notes',
      '- `implementation-brief.md` — target files and UI inventory',
      '- `acceptance.md` — acceptance signals for the shipped prototype',
      '',
    ].join('\n'),
    [`${baseDir}/product-brief.md`]: productDocs.markdownBundle['vision.md'],
    [`${baseDir}/product-plan.json`]: stableJson(input.prebuiltPlan ?? null),
    [`${baseDir}/technical-blueprint.json`]: stableJson({
      generatedAt: productDocs.generatedAt,
      skeletonId: input.skeletonId,
      architectPlan: input.architectPlan,
    }),
    [`${baseDir}/screen-composition.json`]: stableJson(input.compositionPlan ?? null),
    [`${baseDir}/functional-flow.json`]: stableJson(input.functionalFlowPlan ?? null),
    [`${baseDir}/skeleton-integration.json`]: stableJson(input.skeletonIntegrationPlan ?? null),
    [`${baseDir}/product-specificity.json`]: stableJson(input.productSpecificityPlan ?? null),
    [PRODUCT_DOCS_JSON_PATH]: stableJson(productDocs),
  };

  for (const [fileName, content] of Object.entries(productDocs.markdownBundle)) {
    files[`${baseDir}/${fileName}`] = content;
  }

  const materializedFiles = Object.keys(files).sort((left, right) => left.localeCompare(right));
  const telemetry: ProductDocumentSetTelemetry = {
    built: true,
    saved: true,
    id: productDocs.id,
    persistenceTarget: 'project_storage',
    featureChecklistItemCount: productDocs.featureChecklist.length,
    featureChecklistMustCount: productDocs.featureChecklist.filter(item => item.priority === 'must').length,
    markdownBundleFiles: Object.keys(productDocs.markdownBundle).sort((left, right) => left.localeCompare(right)),
  };

  return {
    baseDir,
    files,
    materializedFiles,
    productDocs,
    telemetry,
  };
}
