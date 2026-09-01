import type { SkeletonId } from './SkeletonRegistry';
import { getSkeletonQualityContract } from './SkeletonQualityContract';
import type {
  FunctionalFlowPlan,
  FunctionalImplementationDiagnostics,
} from './FunctionalFlowPlanner';

export interface AppFirstArchitectPlanShape {
  pages?: Array<{ path: string; name: string; file: string; purpose?: string }>;
  deltaFiles?: Array<{ path: string; purpose?: string }>;
}

export interface AppFirstQualityGateTelemetry {
  profile: 'app-first' | 'not-app-first';
  checked: boolean;
  meaningful_screen_count: number;
  minimum_meaningful_screens: number;
  planned_screen_count: number;
  missing_planned_screens: string[];
  route_target_count: number;
  navigation_target_count: number;
  connected_screen_count: number;
  orphan_screen_count: number;
  data_file_count: number;
  data_consumer_screen_count: number;
  non_empty_action_handler_count: number;
  functional_flow_coverage_ratio: number;
  implemented_flow_count: number;
  planned_flow_count: number;
  empty_handler_count: number;
}

export interface AppFirstQualityGateResult {
  ok: boolean;
  blockingReasons: string[];
  repairInstructions: string[];
  advisoryReasons: string[];
  telemetry: AppFirstQualityGateTelemetry;
}

function normalizePath(path: string): string {
  return path.replace(/^src[\\/]/, '').replace(/\\/g, '/');
}

function isScreenPath(path: string): boolean {
  const normalized = normalizePath(path);
  return /^(?:pages|screens|components\/screens)\/[^/]+\.tsx$/.test(normalized);
}

function isMeaningfulScreen(content: string): boolean {
  const source = content.trim();
  if (source.length < 100) return false;
  const exportsComponent = /export\s+default\s+(?:function|class|[A-Za-z_$])/.test(source);
  const rendersJsx = /return\s*[<(]/.test(source) || /=>\s*\(?\s*</.test(source);
  const visibleMarkup = /<(?:section|main|article|div|h1|h2|p|button|form|ul|ol|Card|Button)\b/.test(source);
  return exportsComponent && rendersJsx && visibleMarkup;
}

function baseName(path: string): string {
  const normalized = normalizePath(path);
  return normalized.split('/').pop()?.replace(/\.tsx?$/, '').toLowerCase() ?? '';
}

function countRouteTargets(content: string): number {
  const literals = Array.from(content.matchAll(/:\s*['"]\/(?:[^'"]*)['"]/g)).map(match => match[0]);
  return new Set(literals).size;
}

function countNavigationTargets(content: string): number {
  const routeRefs = Array.from(content.matchAll(/\bROUTES\.([A-Za-z0-9_]+)/g)).map(match => match[1]);
  const literalTargets = Array.from(content.matchAll(/\bto\s*:\s*['"]\/(?:[^'"]*)['"]/g)).map(match => match[0]);
  return new Set([...routeRefs, ...literalTargets]).size;
}

function screenConsumesData(content: string): boolean {
  return /from\s+['"](?:@\/data\/|\.\.?\/data\/)/.test(content)
    || /\bSEED_[A-Z0-9_]+\b/.test(content)
    || /\buseApp\s*\(/.test(content);
}

function connectedScreenNames(input: {
  screenEntries: Array<[string, string]>;
  routesSource: string;
  navigationSource: string;
}): Set<string> {
  const connected = new Set<string>();
  const graphSource = `${input.routesSource}\n${input.navigationSource}`.toLowerCase();
  for (const [path, content] of input.screenEntries) {
    const name = baseName(path);
    if (!name) continue;
    const ownNavigation = /\b(?:Link|NavLink|navigate|detailRoute|ROUTES\.)\b/.test(content);
    if (graphSource.includes(name) || ownNavigation || name === 'onboarding') connected.add(name);
  }
  return connected;
}

function pushBlocking(
  reasons: string[],
  instructions: string[],
  reason: string,
  instruction: string,
): void {
  reasons.push(reason);
  instructions.push(instruction);
}

export function evaluateAppFirstQualityGate(input: {
  skeletonId: SkeletonId;
  files: Record<string, string>;
  architectPlan?: AppFirstArchitectPlanShape | null;
  functionalFlowPlan?: FunctionalFlowPlan | null;
  functionalDiagnostics?: FunctionalImplementationDiagnostics | null;
}): AppFirstQualityGateResult {
  const qualityContract = getSkeletonQualityContract(input.skeletonId);
  const isAppFirst = qualityContract.profile === 'app-first';
  const minimumMeaningfulScreens = isAppFirst ? qualityContract.minMeaningfulScreens : 0;

  if (!isAppFirst) {
    return {
      ok: true,
      blockingReasons: [],
      repairInstructions: [],
      advisoryReasons: [],
      telemetry: {
        profile: 'not-app-first',
        checked: false,
        meaningful_screen_count: 0,
        minimum_meaningful_screens: 0,
        planned_screen_count: 0,
        missing_planned_screens: [],
        route_target_count: 0,
        navigation_target_count: 0,
        connected_screen_count: 0,
        orphan_screen_count: 0,
        data_file_count: 0,
        data_consumer_screen_count: 0,
        non_empty_action_handler_count: 0,
        functional_flow_coverage_ratio: 0,
        implemented_flow_count: 0,
        planned_flow_count: 0,
        empty_handler_count: 0,
      },
    };
  }

  const normalizedEntries = Object.entries(input.files).map(([path, content]) => [normalizePath(path), content] as const);
  const screenEntries = normalizedEntries
    .filter(([path]) => isScreenPath(path))
    .filter(([, content]) => isMeaningfulScreen(content));
  const meaningfulScreenPaths = new Set(screenEntries.map(([path]) => path));

  const plannedScreenPaths = (input.architectPlan?.pages ?? [])
    .map(page => normalizePath(page.file))
    .filter(path => isScreenPath(path));
  const missingPlannedScreens = plannedScreenPaths.filter(path => !meaningfulScreenPaths.has(path));

  const routesSource = normalizedEntries.find(([path]) => path === 'config/routes.ts')?.[1] ?? '';
  const navigationSource = normalizedEntries.find(([path]) => path === 'config/navigation.ts')?.[1] ?? '';
  const routeTargetCount = countRouteTargets(routesSource);
  const navigationTargetCount = countNavigationTargets(navigationSource);

  const connectedNames = connectedScreenNames({
    screenEntries: screenEntries.map(([path, content]) => [path, content]),
    routesSource,
    navigationSource,
  });
  const orphanScreens = screenEntries
    .map(([path]) => baseName(path))
    .filter(name => name && !connectedNames.has(name));

  const dataFiles = normalizedEntries.filter(([path, content]) => (
    /^data\/[^/]+\.tsx?$/.test(path) && content.trim().length >= 80
  ));
  const dataConsumerScreens = screenEntries.filter(([, content]) => screenConsumesData(content));

  const functionalDiagnostics = input.functionalDiagnostics ?? null;
  const nonEmptyActionHandlerCount = functionalDiagnostics
    ? Math.max(0, functionalDiagnostics.handlerCount - functionalDiagnostics.emptyHandlerCount)
    : normalizedEntries.reduce((count, [, content]) => count + Array.from(content.matchAll(/\bon(?:Click|Submit|Change)\s*=/g)).length, 0);
  const flowCoverage = functionalDiagnostics?.implementationCoverageRatio ?? 0;
  const plannedFlowCount = functionalDiagnostics?.plannedFlowCount
    ?? input.functionalFlowPlan?.flows.length
    ?? 0;
  const implementedFlowCount = functionalDiagnostics?.flowsWithLikelyImplementation.length ?? 0;
  const emptyHandlerCount = functionalDiagnostics?.emptyHandlerCount ?? 0;

  const blockingReasons: string[] = [];
  const repairInstructions: string[] = [];
  const advisoryReasons: string[] = [];

  if (screenEntries.length < minimumMeaningfulScreens) {
    pushBlocking(
      blockingReasons,
      repairInstructions,
      `App-first prototype has only ${screenEntries.length} meaningful screen(s); requires at least ${minimumMeaningfulScreens}.`,
      `Implement at least ${minimumMeaningfulScreens} real app screens in the declared page slots. Each screen must render product-specific UI instead of a stub or placeholder.`,
    );
  }

  if (missingPlannedScreens.length > 0) {
    pushBlocking(
      blockingReasons,
      repairInstructions,
      `Architect-planned app screens are missing or non-meaningful: ${missingPlannedScreens.slice(0, 5).join(', ')}.`,
      `Implement the missing planned screens (${missingPlannedScreens.slice(0, 5).join(', ')}) as complete product-specific pages within the allowed product slots.`,
    );
  }

  if (routeTargetCount < minimumMeaningfulScreens || navigationTargetCount < 3) {
    pushBlocking(
      blockingReasons,
      repairInstructions,
      `App navigation graph is incomplete: routes=${routeTargetCount}, navigation targets=${navigationTargetCount}.`,
      'Wire the real screens through config/routes.ts and config/navigation.ts. Bottom navigation must expose at least three real destinations and the route table must cover the app screens.',
    );
  }

  const allowedOrphans = Math.max(0, screenEntries.length - minimumMeaningfulScreens);
  if (orphanScreens.length > allowedOrphans || connectedNames.size < minimumMeaningfulScreens) {
    pushBlocking(
      blockingReasons,
      repairInstructions,
      `App screen connectivity is incomplete: connected=${connectedNames.size}/${screenEntries.length}, orphaned=${orphanScreens.join(', ') || 'none'}.`,
      'Connect every core screen to the route/navigation graph or a visible user action. Do not leave generated screens unreachable from the working app flow.',
    );
  }

  if (dataFiles.length < 2 || dataConsumerScreens.length < 2) {
    pushBlocking(
      blockingReasons,
      repairInstructions,
      `App product data is too thin: data files=${dataFiles.length}, screens consuming data=${dataConsumerScreens.length}.`,
      'Provide typed product data plus realistic seed/mock data, and render that data on at least two mobile screens. Static decorative copy alone is not a functional app.',
    );
  }

  if (emptyHandlerCount > 0) {
    pushBlocking(
      blockingReasons,
      repairInstructions,
      `App-first prototype contains ${emptyHandlerCount} empty interaction handler(s).`,
      'Replace empty click/submit handlers with visible local state changes, navigation, create/update behavior, or another deterministic product action.',
    );
  }

  if (nonEmptyActionHandlerCount < 2 || (plannedFlowCount > 0 && flowCoverage < 0.4)) {
    pushBlocking(
      blockingReasons,
      repairInstructions,
      `App actions are insufficient: handlers=${nonEmptyActionHandlerCount}, implemented flow coverage=${Math.round(flowCoverage * 100)}%.`,
      'Implement the core FunctionalFlowPlan with real local actions: at minimum one create/update action plus another visible state-changing interaction or navigation-driven product flow.',
    );
  } else if (plannedFlowCount > 0 && flowCoverage < 0.7) {
    advisoryReasons.push(
      `App functional flow coverage is ${Math.round(flowCoverage * 100)}%; core gate passes but additional planned flows remain weakly evidenced.`,
    );
  }

  if ((functionalDiagnostics?.derivedDataSignals.length ?? 0) === 0) {
    advisoryReasons.push('App screens have no obvious derived-data signal; progress/summary surfaces may still be static.');
  }

  return {
    ok: blockingReasons.length === 0,
    blockingReasons,
    repairInstructions,
    advisoryReasons,
    telemetry: {
      profile: 'app-first',
      checked: true,
      meaningful_screen_count: screenEntries.length,
      minimum_meaningful_screens: minimumMeaningfulScreens,
      planned_screen_count: plannedScreenPaths.length,
      missing_planned_screens: missingPlannedScreens,
      route_target_count: routeTargetCount,
      navigation_target_count: navigationTargetCount,
      connected_screen_count: connectedNames.size,
      orphan_screen_count: orphanScreens.length,
      data_file_count: dataFiles.length,
      data_consumer_screen_count: dataConsumerScreens.length,
      non_empty_action_handler_count: nonEmptyActionHandlerCount,
      functional_flow_coverage_ratio: flowCoverage,
      implemented_flow_count: implementedFlowCount,
      planned_flow_count: plannedFlowCount,
      empty_handler_count: emptyHandlerCount,
    },
  };
}
