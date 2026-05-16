import type { ScreenCompositionEntry, ScreenCompositionPlan } from './ScreenCompositionPlanner';

type FunctionalFieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'array';

export type FunctionalFlowPlan = {
  productType?: string;
  skeletonId: string;
  primaryUserGoal: string;
  entities: FunctionalDataEntity[];
  flows: FunctionalFlow[];
  globalStateRequirements: string[];
  navigationRules: FunctionalNavigationRule[];
  nonDecorativeRules: string[];
  functionalNotes: string[];
};

export type FunctionalDataEntity = {
  id: string;
  label: string;
  fields: Array<{
    name: string;
    type: FunctionalFieldType;
    example: string;
  }>;
  sampleCount: number;
};

export type FunctionalFlow = {
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
};

export type FunctionalNavigationRule = {
  from: string;
  to: string;
  trigger: string;
  expectedBehavior: string;
};

export interface FunctionalFlowPlanTelemetry {
  product_type?: string;
  skeleton_id: string;
  primary_user_goal: string;
  entity_count: number;
  flow_count: number;
  entities: Array<{
    id: string;
    label: string;
    sample_count: number;
    fields: Array<{
      name: string;
      type: FunctionalFieldType;
      example: string;
    }>;
  }>;
  flows: Array<{
    id: string;
    title: string;
    screen_id: string;
    user_intent: string;
    trigger_elements: string[];
    state_changes: string[];
    affected_entities: string[];
    visible_feedback: string[];
    navigation_target?: string;
    required_implementation: string[];
  }>;
  navigation_rules: Array<{
    from: string;
    to: string;
    trigger: string;
    expected_behavior: string;
  }>;
  non_decorative_rules: string[];
  functional_notes: string[];
}

export type FunctionalImplementationDiagnostics = {
  functionalDiagnosticsChecked: boolean;
  plannedFlowCount: number;
  flowsWithLikelyImplementation: string[];
  flowsWithoutImplementationSignals: string[];
  stateHookCount: number;
  reducerHookCount: number;
  handlerCount: number;
  emptyHandlerCount: number;
  formCount: number;
  controlledInputCount: number;
  submitHandlerCount: number;
  searchOrFilterSignals: string[];
  tabStateSignals: string[];
  navigationSignals: string[];
  localCreateUpdateSignals: string[];
  derivedDataSignals: string[];
  decorativeInteractionWarnings: string[];
  implementationCoverageRatio: number;
  suggestedNextAction: 'none' | 'improve_prompt' | 'add_repair_later';
};

export interface FunctionalImplementationDiagnosticsTelemetry {
  functional_diagnostics_checked: boolean;
  planned_flow_count: number;
  flows_with_likely_implementation: string[];
  flows_without_implementation_signals: string[];
  state_hook_count: number;
  reducer_hook_count: number;
  handler_count: number;
  empty_handler_count: number;
  form_count: number;
  controlled_input_count: number;
  submit_handler_count: number;
  search_or_filter_signals: string[];
  tab_state_signals: string[];
  navigation_signals: string[];
  local_create_update_signals: string[];
  derived_data_signals: string[];
  decorative_interaction_warnings: string[];
  implementation_coverage_ratio: number;
  suggested_next_action: 'none' | 'improve_prompt' | 'add_repair_later';
}

type ScreenRef = Pick<ScreenCompositionEntry, 'id' | 'title' | 'routeHint' | 'role'>;

const NON_DECORATIVE_RULES = [
  'Every primary button must have a visible local effect.',
  'Tabs must switch visible content.',
  'Filters must change visible lists or cards.',
  'Search must filter visible data if present.',
  'Forms must create or update local state or show submitted state.',
  'Navigation controls must change the active screen or view.',
  'Toggle and check actions must update visual state.',
  'Progress and KPI values should derive from local mock data where simple.',
  'Do not leave onClick={() => {}} on primary actions.',
  'Do not use alert() as the only implementation for core product flows.',
  'Do not create buttons that only look clickable.',
  'Decorative buttons are allowed only for clearly secondary marketing CTAs.',
] as const;

const COMMON_FUNCTIONAL_NOTES = [
  'Use local React state, derived data, and mock data only.',
  'Do not introduce backend requirements, external APIs, or persistence beyond lightweight local state.',
  'Keep interactions demo-ready and deterministic instead of overbuilding infrastructure.',
] as const;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'app', 'button', 'buttons', 'card', 'cards', 'change', 'changes',
  'content', 'core', 'create', 'data', 'detail', 'effect', 'elements', 'feedback',
  'flow', 'for', 'form', 'from', 'goal', 'item', 'items', 'list', 'lists', 'local',
  'must', 'open', 'panel', 'real', 'screen', 'show', 'state', 'status', 'tab', 'tabs',
  'the', 'to', 'toggle', 'update', 'updates', 'view', 'visible',
]);

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function makeEntity(
  id: string,
  label: string,
  sampleCount: number,
  fields: FunctionalDataEntity['fields'],
): FunctionalDataEntity {
  return { id, label, sampleCount, fields };
}

function makeFlow(
  id: string,
  title: string,
  screenId: string,
  userIntent: string,
  triggerElements: string[],
  stateChanges: string[],
  affectedEntities: string[],
  visibleFeedback: string[],
  requiredImplementation: string[],
  navigationTarget?: string,
): FunctionalFlow {
  return {
    id,
    title,
    screenId,
    userIntent,
    triggerElements,
    stateChanges,
    affectedEntities,
    visibleFeedback,
    navigationTarget,
    requiredImplementation,
  };
}

function defaultScreensForSkeleton(skeletonId: string): ScreenRef[] {
  switch (skeletonId) {
    case 'mobile-app':
      return [
        { id: 'home-today', title: 'Home / Today', routeHint: '/', role: 'home' },
        { id: 'scan-create', title: 'Scan / Create', routeHint: '/create', role: 'form' },
        { id: 'detail', title: 'Detail', routeHint: '/detail/:id', role: 'detail' },
        { id: 'progress', title: 'Progress', routeHint: '/progress', role: 'progress' },
        { id: 'profile-coach', title: 'Profile / Coach', routeHint: '/profile', role: 'profile' },
      ];
    case 'saas-dashboard':
      return [
        { id: 'dashboard', title: 'Dashboard', routeHint: '/', role: 'dashboard' },
        { id: 'projects', title: 'Projects', routeHint: '/projects', role: 'other' },
        { id: 'quality-feedback', title: 'Quality Feedback', routeHint: '/quality', role: 'other' },
        { id: 'settings', title: 'Settings', routeHint: '/settings', role: 'settings' },
      ];
    case 'landing-page':
      return [
        { id: 'hero', title: 'Hero', routeHint: '/', role: 'home' },
        { id: 'value-prop', title: 'Value Proposition', routeHint: '#value', role: 'other' },
        { id: 'product-preview', title: 'Product Preview', routeHint: '#product', role: 'other' },
        { id: 'features', title: 'Features', routeHint: '#features', role: 'other' },
        { id: 'social-proof-cta', title: 'Social Proof & CTA', routeHint: '#cta', role: 'other' },
      ];
    case 'social-community':
      return [
        { id: 'feed-home', title: 'Feed / Home', routeHint: '/', role: 'feed' },
        { id: 'discover', title: 'Discover', routeHint: '/discover', role: 'other' },
        { id: 'profile', title: 'Profile', routeHint: '/profile', role: 'profile' },
        { id: 'messages', title: 'Messages', routeHint: '/messages', role: 'other' },
        { id: 'create-post', title: 'Create Post', routeHint: '/create', role: 'form' },
      ];
    case 'ecommerce':
      return [
        { id: 'storefront', title: 'Storefront', routeHint: '/', role: 'commerce' },
        { id: 'product-detail', title: 'Product Detail', routeHint: '/product/:id', role: 'detail' },
        { id: 'cart', title: 'Cart', routeHint: '/cart', role: 'other' },
        { id: 'checkout-favorites', title: 'Checkout / Favorites', routeHint: '/checkout', role: 'form' },
        { id: 'profile-orders', title: 'Profile / Orders', routeHint: '/profile', role: 'profile' },
      ];
    case 'productivity-tool':
      return [
        { id: 'workspace', title: 'Workspace', routeHint: '/', role: 'dashboard' },
        { id: 'projects', title: 'Projects', routeHint: '/projects', role: 'other' },
        { id: 'tasks', title: 'Tasks', routeHint: '/tasks', role: 'other' },
        { id: 'settings', title: 'Settings', routeHint: '/settings', role: 'settings' },
      ];
    default:
      return [
        { id: 'main', title: 'Main', routeHint: '/', role: 'home' },
        { id: 'secondary', title: 'Secondary', routeHint: '/secondary', role: 'other' },
      ];
  }
}

function getScreens(
  skeletonId: string,
  screenCompositionPlan?: ScreenCompositionPlan,
): ScreenRef[] {
  if (screenCompositionPlan?.screens.length) {
    return screenCompositionPlan.screens.map(screen => ({
      id: screen.id,
      title: screen.title,
      routeHint: screen.routeHint,
      role: screen.role,
    }));
  }
  return defaultScreensForSkeleton(skeletonId);
}

function findScreen(
  screens: ScreenRef[],
  keywords: string[],
  fallbackIndex = 0,
): ScreenRef {
  const lowerKeywords = keywords.map(keyword => keyword.toLowerCase());
  const match = screens.find((screen) => {
    const haystack = `${screen.id} ${screen.title} ${screen.routeHint ?? ''} ${screen.role ?? ''}`.toLowerCase();
    return lowerKeywords.some(keyword => haystack.includes(keyword));
  });
  return match ?? screens[Math.min(fallbackIndex, Math.max(0, screens.length - 1))] ?? {
    id: 'main',
    title: 'Main',
    routeHint: '/',
    role: 'home',
  };
}

function hasKeyword(brief: string, pattern: RegExp): boolean {
  return pattern.test(brief.toLowerCase());
}

function isHealthWellnessBrief(brief: string): boolean {
  return hasKeyword(brief, /\b(health|wellness|fitness|habit|routine|nutrition|meal|mindful|meditat|mood|sleep|hydration|workout|yoga)\b/);
}

function isAiCoachBrief(brief: string): boolean {
  return hasKeyword(brief, /\b(ai|coach|assistant|recommendation|gpt|llm)\b/);
}

function isPricingBrief(brief: string): boolean {
  return hasKeyword(brief, /\b(pricing|price|billing|monthly|annual|yearly|plan|plans)\b/);
}

function isFaqBrief(brief: string): boolean {
  return hasKeyword(brief, /\b(faq|question|questions|support|help|how it works)\b/);
}

function deriveProductType(input: {
  brief: string;
  skeletonId: string;
  screenCompositionPlan?: ScreenCompositionPlan;
}): string | undefined {
  const planProductType = input.screenCompositionPlan?.productType?.trim();
  if (planProductType) return planProductType;

  if (isHealthWellnessBrief(input.brief)) return 'health-wellness';
  if (hasKeyword(input.brief, /\b(shop|store|commerce|product|cart|checkout)\b/)) return 'ecommerce';
  if (hasKeyword(input.brief, /\b(community|social|creator|feed|post|follow|message)\b/)) return 'social-community';
  if (hasKeyword(input.brief, /\b(landing|marketing|signup|launch|waitlist)\b/)) return 'landing-page';
  if (hasKeyword(input.brief, /\b(dashboard|workspace|analytics|quality|experiment|pipeline)\b/)) return 'saas-dashboard';
  return input.skeletonId;
}

function inferPrimaryUserGoal(input: {
  brief: string;
  skeletonId: string;
  productType?: string;
}): string {
  if (input.skeletonId === 'mobile-app' && isHealthWellnessBrief(input.brief)) {
    return 'Complete today\'s wellness actions and see progress update immediately.';
  }
  switch (input.skeletonId) {
    case 'mobile-app':
      return 'Finish the main daily action and see the app state change without backend support.';
    case 'saas-dashboard':
      return 'Move work forward by filtering data, opening details, and creating or updating local records.';
    case 'landing-page':
      return 'Move from headline to product proof and signup intent without dead-end interactions.';
    case 'social-community':
      return 'Create and react to content while switching between feed, profile, and community views.';
    case 'ecommerce':
      return 'Browse products, inspect details, and update the cart with totals that change live.';
    case 'productivity-tool':
      return 'Switch workspace views, update tasks, and see derived progress from local data.';
    default:
      return `Show a working ${input.productType ?? 'product'} demo with local stateful interactions instead of static screens.`;
  }
}

function buildMobilePlan(input: {
  brief: string;
  screens: ScreenRef[];
  productType?: string;
}): Pick<FunctionalFlowPlan, 'entities' | 'flows' | 'globalStateRequirements' | 'navigationRules' | 'functionalNotes'> {
  const home = findScreen(input.screens, ['home', 'today'], 0);
  const create = findScreen(input.screens, ['create', 'scan'], 1);
  const detail = findScreen(input.screens, ['detail'], 2);
  const progress = findScreen(input.screens, ['progress'], 3);
  const profile = findScreen(input.screens, ['profile', 'coach', 'settings'], input.screens.length - 1);
  const healthWellness = isHealthWellnessBrief(input.brief);
  const aiCoach = isAiCoachBrief(input.brief) || healthWellness;

  const entities = healthWellness
    ? [
        makeEntity('habit', 'Habit', 6, [
          { name: 'id', type: 'string', example: 'habit-1' },
          { name: 'name', type: 'string', example: 'Morning walk' },
          { name: 'streak', type: 'number', example: '5' },
          { name: 'completedToday', type: 'boolean', example: 'true' },
          { name: 'category', type: 'enum', example: 'movement' },
        ]),
        makeEntity('checkResult', 'Check Result', 4, [
          { name: 'id', type: 'string', example: 'result-1' },
          { name: 'title', type: 'string', example: 'Lunch scan' },
          { name: 'status', type: 'enum', example: 'balanced' },
          { name: 'score', type: 'number', example: '82' },
          { name: 'createdAt', type: 'date', example: '2026-05-17' },
        ]),
        makeEntity('planItem', 'Plan Item', 5, [
          { name: 'id', type: 'string', example: 'plan-1' },
          { name: 'title', type: 'string', example: 'Stretch for 10 minutes' },
          { name: 'completed', type: 'boolean', example: 'false' },
          { name: 'scheduledFor', type: 'date', example: '2026-05-17' },
        ]),
        makeEntity('coachMessage', 'Coach Message', 6, [
          { name: 'id', type: 'string', example: 'msg-1' },
          { name: 'role', type: 'enum', example: 'assistant' },
          { name: 'body', type: 'string', example: 'Nice work. Add one more glass of water tonight.' },
          { name: 'createdAt', type: 'date', example: '2026-05-17T09:00:00Z' },
        ]),
        makeEntity('preference', 'Preference', 1, [
          { name: 'remindersEnabled', type: 'boolean', example: 'true' },
          { name: 'goalFocus', type: 'enum', example: 'energy' },
          { name: 'coachTone', type: 'enum', example: 'supportive' },
        ]),
      ]
    : [
        makeEntity('entry', 'Daily Entry', 6, [
          { name: 'id', type: 'string', example: 'entry-1' },
          { name: 'title', type: 'string', example: 'Daily check-in' },
          { name: 'status', type: 'enum', example: 'done' },
          { name: 'createdAt', type: 'date', example: '2026-05-17' },
        ]),
        makeEntity('progressSnapshot', 'Progress Snapshot', 4, [
          { name: 'id', type: 'string', example: 'progress-week' },
          { name: 'label', type: 'string', example: 'This week' },
          { name: 'value', type: 'number', example: '72' },
          { name: 'trend', type: 'enum', example: 'up' },
        ]),
        makeEntity('messageThread', 'Message Thread', 5, [
          { name: 'id', type: 'string', example: 'thread-1' },
          { name: 'messages', type: 'array', example: '2 messages' },
          { name: 'updatedAt', type: 'date', example: '2026-05-17T09:00:00Z' },
        ]),
        makeEntity('preference', 'Preference', 1, [
          { name: 'notificationsEnabled', type: 'boolean', example: 'true' },
          { name: 'defaultMode', type: 'enum', example: 'focus' },
          { name: 'themeVariant', type: 'enum', example: 'calm' },
        ]),
      ];

  const flows: FunctionalFlow[] = [
    makeFlow(
      'bottom-nav-switch',
      'Switch mobile screens from bottom navigation',
      home.id,
      'Move between the main app views without dead taps.',
      ['Bottom nav Home', 'Bottom nav Progress', 'Bottom nav Profile'],
      ['activeTab changes', 'activeScreen changes'],
      [],
      ['Selected screen content changes', 'Active tab highlight updates'],
      ['useState(activeTab)', 'setActiveTab(tabId)', 'conditional view rendering'],
      progress.id,
    ),
    healthWellness
      ? makeFlow(
          'complete-habit',
          'Complete a habit or today action',
          home.id,
          'Mark a habit done and watch streak or completion progress move.',
          ['Complete habit button', 'Today check action', 'Done chip'],
          ['toggle completedToday', 'update completedDates', 'recompute completionRate'],
          ['habit', 'planItem'],
          ['Completed card state updates', 'Progress ring updates', 'Today count updates'],
          ['setHabits(items.map(...))', 'setCompletedIds(next)', 'useMemo(completionRate)'],
        )
      : makeFlow(
          'primary-daily-action',
          'Run the primary daily action',
          home.id,
          'Use the main action button and see the home screen change immediately.',
          ['Primary action button', 'Today action card'],
          ['append entry', 'update status', 'refresh summary'],
          ['entry', 'progressSnapshot'],
          ['New entry card appears', 'Status badge updates', 'Summary value changes'],
          ['useState(entries)', 'setEntries([...entries, nextEntry])', 'useMemo(summaryCards)'],
        ),
    healthWellness
      ? makeFlow(
          'scan-or-check-result',
          'Produce a local result card from scan or check flow',
          create.id,
          'Create a check result that looks real without calling external services.',
          ['Scan button', 'Check now button', 'Create result button'],
          ['append checkResult', 'setLatestResult', 'clear draft form'],
          ['checkResult'],
          ['Result card appears', 'Score badge updates', 'Recent result list updates'],
          ['useState(results)', 'setResults([...results, nextResult])', 'setSelectedResult(resultId)'],
          detail.id,
        )
      : makeFlow(
          'create-entry',
          'Create a new local entry',
          create.id,
          'Submit the creation form and show the new item locally.',
          ['Create button', 'Save entry button', 'Submit form'],
          ['append entry', 'reset draft form', 'select created item'],
          ['entry'],
          ['New list row appears', 'Form switches to submitted state', 'Detail opens or preview updates'],
          ['useState(entryDraft)', 'onSubmit(handleCreateEntry)', 'setEntries([...entries, nextEntry])'],
          detail.id,
        ),
    healthWellness
      ? makeFlow(
          'plan-item-checkoff',
          'Check off plan items from today view',
          detail.id,
          'Toggle a plan item and keep today and progress screens in sync.',
          ['Plan checkbox', 'Today checklist row'],
          ['toggle planItem.completed', 'update completedIds', 'refresh completion totals'],
          ['planItem', 'habit'],
          ['Checklist row changes state', 'Completed count updates', 'Next step recommendation changes'],
          ['setPlanItems(items.map(...))', 'setCompletedIds(next)', 'useMemo(todaySummary)'],
        )
      : makeFlow(
          'detail-status-update',
          'Update item status from detail view',
          detail.id,
          'Change an item status and reflect that change in the overview.',
          ['Status button', 'Mark done button', 'Toggle state control'],
          ['update selected item status', 'refresh derived metrics'],
          ['entry'],
          ['Status pill updates', 'Detail footer changes', 'Progress snapshot updates'],
          ['setEntries(items.map(...))', 'useState(selectedEntryId)', 'useMemo(progressSummary)'],
        ),
    makeFlow(
      'progress-derived-summary',
      'Show progress derived from local data',
      progress.id,
      'Open the progress screen and see metrics derived from completed actions.',
      ['Progress tab', 'Progress card'],
      ['derive totals from local items', 'calculate completion percentage'],
      healthWellness ? ['habit', 'planItem'] : ['entry', 'progressSnapshot'],
      ['Chart, ring, or KPI values update', 'Milestones reflect current state'],
      ['useMemo(progressSummary)', 'items.reduce(...)', 'items.filter(...)'],
    ),
  ];

  if (aiCoach) {
    flows.push(
      makeFlow(
        'coach-thread',
        'Show a local coach or assistant thread',
        profile.id,
        'Let the user send a lightweight message and receive a local suggested reply.',
        ['Coach input', 'Send button', 'Suggested reply chip'],
        ['append coachMessage', 'setDraftMessage', 'setSuggestedReply'],
        healthWellness ? ['coachMessage'] : ['messageThread'],
        ['Message thread grows', 'Suggested reply appears', 'Last updated label changes'],
        ['useState(messages)', 'setMessages([...messages, nextMessage])', 'setDraftMessage(\'\')'],
      ),
    );
  }

  flows.push(
    makeFlow(
      'settings-toggle',
      'Toggle profile or settings preferences',
      profile.id,
      'Change a preference and keep the UI visibly in sync.',
      ['Reminder toggle', 'Preference switch', 'Goal selector'],
      ['update preference', 'toggle reminders', 'change selected goal'],
      ['preference'],
      ['Switch position updates', 'Summary label updates', 'Preference chip changes'],
      ['useState(preferences)', 'setPreferences({ ...preferences, remindersEnabled: !preferences.remindersEnabled })', 'controlled input state'],
    ),
  );

  return {
    entities,
    flows,
    globalStateRequirements: uniqueStrings([
      'useState(activeTab) for bottom navigation and screen switching.',
      healthWellness ? 'useState(habits) with completedToday/completedDates mutation helpers.' : 'useState(entries) for create/update flows.',
      'useState(selectedItemId) for detail routing or card expansion.',
      'useState(formDraft) for local forms and check flows.',
      'useMemo(progressSummary) so progress values derive from local mock data.',
      aiCoach ? 'useState(messages) and useState(draftMessage) for coach thread interactions.' : null,
      'useState(preferences) for profile and settings toggles.',
    ]),
    navigationRules: [
      {
        from: home.id,
        to: create.id,
        trigger: 'Bottom nav or primary create action',
        expectedBehavior: `Update activeTab or route state and render ${create.id} with the creation UI.`,
      },
      {
        from: home.id,
        to: progress.id,
        trigger: 'Bottom nav Progress tab',
        expectedBehavior: `Switch the visible view to ${progress.id} and keep tab state highlighted.`,
      },
      {
        from: home.id,
        to: profile.id,
        trigger: 'Bottom nav Profile tab',
        expectedBehavior: `Switch the visible view to ${profile.id} and preserve local state for preferences or coach content.`,
      },
      {
        from: create.id,
        to: detail.id,
        trigger: 'Submit create or scan flow',
        expectedBehavior: `Show the created result in ${detail.id} or open the selected item detail without server calls.`,
      },
    ],
    functionalNotes: uniqueStrings([
      ...COMMON_FUNCTIONAL_NOTES,
      healthWellness ? 'Habit completion, plan checkoffs, and check results should all influence progress locally.' : 'The main action should create or update visible home-state immediately.',
      aiCoach ? 'Coach replies may be seeded from deterministic canned suggestions instead of network calls.' : null,
      input.productType ? `Functional plan anchored to productType=${input.productType}.` : null,
    ]),
  };
}

function buildSaasPlan(input: {
  screens: ScreenRef[];
  skeletonId: string;
  productType?: string;
}): Pick<FunctionalFlowPlan, 'entities' | 'flows' | 'globalStateRequirements' | 'navigationRules' | 'functionalNotes'> {
  const dashboard = findScreen(input.screens, ['dashboard', 'workspace'], 0);
  const projects = findScreen(input.screens, ['projects'], 1);
  const quality = findScreen(input.screens, ['quality', 'feedback', 'tasks'], 2);
  const settings = findScreen(input.screens, ['settings'], input.screens.length - 1);

  const primaryEntityId = input.skeletonId === 'productivity-tool' ? 'task' : 'workspaceItem';
  const primaryEntityLabel = input.skeletonId === 'productivity-tool' ? 'Task' : 'Workspace Item';

  return {
    entities: [
      makeEntity(primaryEntityId, primaryEntityLabel, 8, [
        { name: 'id', type: 'string', example: 'item-1' },
        { name: 'title', type: 'string', example: input.skeletonId === 'productivity-tool' ? 'Ship launch checklist' : 'Launch review pipeline' },
        { name: 'status', type: 'enum', example: 'in-progress' },
        { name: 'owner', type: 'string', example: 'Ava' },
        { name: 'updatedAt', type: 'date', example: '2026-05-17' },
      ]),
      makeEntity('filterState', 'Filter State', 1, [
        { name: 'query', type: 'string', example: 'launch' },
        { name: 'status', type: 'enum', example: 'needs-review' },
        { name: 'activeView', type: 'enum', example: 'quality' },
      ]),
      makeEntity('feedbackRecord', 'Feedback Record', 6, [
        { name: 'id', type: 'string', example: 'feedback-1' },
        { name: 'source', type: 'enum', example: 'quality-check' },
        { name: 'severity', type: 'enum', example: 'medium' },
        { name: 'status', type: 'enum', example: 'open' },
        { name: 'note', type: 'string', example: 'Improve empty state copy' },
      ]),
      makeEntity('workspacePreference', 'Workspace Preference', 1, [
        { name: 'compactMode', type: 'boolean', example: 'true' },
        { name: 'highlightQuality', type: 'boolean', example: 'true' },
        { name: 'defaultView', type: 'enum', example: 'dashboard' },
      ]),
    ],
    flows: [
      makeFlow(
        'workspace-navigation',
        'Switch workspace views from navigation',
        dashboard.id,
        'Move between dashboard, project, quality, and settings views with real state changes.',
        ['Sidebar item', 'Top nav tab', 'Workspace switcher'],
        ['activeView changes', 'selectedWorkspaceScreen changes'],
        [],
        ['Main content switches', 'Active nav item updates'],
        ['useState(activeView)', 'setActiveView(viewId)', 'conditional workspace rendering'],
        projects.id,
      ),
      makeFlow(
        'search-and-filter',
        'Filter the visible list or table',
        dashboard.id,
        'Search and status filters must change the items shown on screen.',
        ['Search input', 'Status filter chips', 'View filter buttons'],
        ['update query', 'update activeStatus', 'derive filtered rows'],
        [primaryEntityId, 'filterState'],
        ['List rows change', 'Result count updates', 'Filter chip highlights update'],
        ['useState(query)', 'useState(activeStatus)', 'items.filter(...)'],
      ),
      makeFlow(
        'create-work-item',
        'Create a new workspace record',
        projects.id,
        'Open a light form or inline creator and add a new item locally.',
        ['New button', 'Create experiment button', 'Add task button'],
        ['open create modal', 'append new item', 'clear create draft'],
        [primaryEntityId],
        ['New row appears', 'Dialog closes or submitted state shows', 'KPI total updates'],
        ['useState(isCreateOpen)', 'setIsCreateOpen(true)', 'setItems([...items, nextItem])'],
      ),
      makeFlow(
        'detail-panel-open',
        'Open a row detail panel or detail screen',
        projects.id,
        'Selecting a row should reveal the selected record details.',
        ['Table row click', 'Card click', 'Open detail action'],
        ['setSelectedItemId', 'setSelectedItem', 'setIsDetailOpen'],
        [primaryEntityId],
        ['Detail panel opens', 'Selected row highlights', 'Detail content updates'],
        ['useState(selectedItemId)', 'setSelectedItemId(item.id)', 'setOpen(true)'],
        quality.id,
      ),
      makeFlow(
        'quality-dataset-switch',
        'Switch quality or readiness datasets',
        quality.id,
        'Feedback, quality, and launch readiness views should show different filtered datasets.',
        ['Quality tab', 'Feedback tab', 'Readiness view switch'],
        ['update activeDataset', 'derive filtered feedback list'],
        ['feedbackRecord', 'filterState'],
        ['Quality table changes', 'Readiness score changes', 'Counts per severity update'],
        ['useState(activeDataset)', 'feedback.filter(...)', 'feedback.reduce(...)'],
      ),
      makeFlow(
        'derived-kpi-values',
        'Derive KPI or status summaries from mock data',
        dashboard.id,
        'KPI cards should be calculated from the same local dataset the table uses.',
        ['Dashboard load', 'Filter change'],
        ['recompute totals', 'recompute readiness score'],
        [primaryEntityId, 'feedbackRecord'],
        ['KPI cards update', 'Trend or quality summary updates'],
        ['useMemo(kpiCards)', 'items.reduce(...)', 'feedback.reduce(...)'],
      ),
      makeFlow(
        'workspace-settings-toggle',
        'Update workspace preferences',
        settings.id,
        'Settings controls should change local preference state and visible labels.',
        ['Compact mode switch', 'Highlight quality toggle', 'Default view select'],
        ['update workspacePreference', 'persist local settings state'],
        ['workspacePreference'],
        ['Switch state updates', 'Preference summary updates'],
        ['useState(preferences)', 'setPreferences({ ...preferences, compactMode: !preferences.compactMode })', 'controlled input state'],
      ),
    ],
    globalStateRequirements: [
      'useState(activeView) for sidebar or top-nav workspace switching.',
      `useState(${primaryEntityId === 'task' ? 'tasks' : 'items'}) for local create and update flows.`,
      'useState(query) and useState(activeStatus) for list and table filtering.',
      'useState(selectedItemId) or useState(isDetailOpen) for row-detail behavior.',
      'useMemo(filteredRows) and useMemo(kpiCards) for derived list and KPI output.',
      'useState(preferences) for settings and display toggles.',
    ],
    navigationRules: [
      {
        from: dashboard.id,
        to: projects.id,
        trigger: 'Sidebar or top-nav Projects item',
        expectedBehavior: `Set activeView to ${projects.id} and render the project list or work queue.`,
      },
      {
        from: dashboard.id,
        to: quality.id,
        trigger: 'Quality or Feedback navigation item',
        expectedBehavior: `Switch to ${quality.id} and show a filtered dataset instead of leaving the view static.`,
      },
      {
        from: dashboard.id,
        to: settings.id,
        trigger: 'Settings navigation item',
        expectedBehavior: `Render ${settings.id} and keep preference edits in local state.`,
      },
    ],
    functionalNotes: uniqueStrings([
      ...COMMON_FUNCTIONAL_NOTES,
      'Dashboard navigation, search, filters, create actions, and row selection must all have visible local behavior.',
      input.productType ? `Functional plan anchored to productType=${input.productType}.` : null,
    ]),
  };
}

function buildLandingPlan(input: {
  brief: string;
  screens: ScreenRef[];
  productType?: string;
}): Pick<FunctionalFlowPlan, 'entities' | 'flows' | 'globalStateRequirements' | 'navigationRules' | 'functionalNotes'> {
  const hero = findScreen(input.screens, ['hero'], 0);
  const preview = findScreen(input.screens, ['product', 'preview'], 2);
  const cta = findScreen(input.screens, ['cta', 'social'], input.screens.length - 1);
  const features = findScreen(input.screens, ['features'], 3);

  const includePricing = isPricingBrief(input.brief);
  const includeFaq = isFaqBrief(input.brief);

  const entities = [
    makeEntity('previewView', 'Preview View', 3, [
      { name: 'id', type: 'string', example: 'preview-overview' },
      { name: 'label', type: 'string', example: 'Overview' },
      { name: 'isActive', type: 'boolean', example: 'true' },
    ]),
  ];
  if (includePricing) {
    entities.push(makeEntity('pricingOption', 'Pricing Option', 3, [
      { name: 'id', type: 'string', example: 'pro' },
      { name: 'billingPeriod', type: 'enum', example: 'annual' },
      { name: 'price', type: 'number', example: '29' },
      { name: 'featured', type: 'boolean', example: 'true' },
    ]));
  }
  if (includeFaq) {
    entities.push(makeEntity('faqItem', 'FAQ Item', 4, [
      { name: 'id', type: 'string', example: 'faq-1' },
      { name: 'question', type: 'string', example: 'How fast can teams launch?' },
      { name: 'answer', type: 'string', example: 'Most teams are demo-ready in one afternoon.' },
      { name: 'isOpen', type: 'boolean', example: 'false' },
    ]));
  }

  const flows: FunctionalFlow[] = [
    makeFlow(
      'hero-cta-scroll',
      'Use the primary CTA to move to product proof',
      hero.id,
      'The first CTA should scroll or navigate to the preview or signup section.',
      ['Primary CTA', 'Get demo button', 'Start trial button'],
      ['update activeSection', 'scroll target into view'],
      [],
      ['Preview or CTA section becomes visible', 'Current section state updates'],
      ['useState(activeSection)', 'scrollIntoView()', 'setActiveSection(sectionId)'],
      preview.id,
    ),
    makeFlow(
      'product-preview-tabs',
      'Switch the product preview content',
      preview.id,
      'Preview tabs should swap visible product content instead of staying static.',
      ['Preview tab', 'Feature tab', 'Product demo tab'],
      ['update activePreviewTab', 'derive visible preview panel'],
      ['previewView'],
      ['Visible product panel changes', 'Active tab highlight updates'],
      ['useState(activePreviewTab)', 'setActivePreviewTab(tabId)', 'conditional preview rendering'],
    ),
  ];

  if (includePricing) {
    flows.push(
      makeFlow(
        'pricing-toggle',
        'Toggle pricing or plan presentation',
        features.id,
        'Monthly versus annual controls should change visible prices or highlighted plans.',
        ['Billing toggle', 'Monthly button', 'Annual button'],
        ['update billingPeriod', 'derive visible prices'],
        ['pricingOption'],
        ['Price labels change', 'Savings badge updates', 'Selected plan styling updates'],
        ['useState(billingPeriod)', 'setBillingPeriod(period)', 'pricingOptions.map(...)'],
      ),
    );
  }

  if (includeFaq) {
    flows.push(
      makeFlow(
        'faq-accordion',
        'Open and close FAQ answers',
        cta.id,
        'FAQ rows should expand and collapse with visible state changes.',
        ['FAQ row', 'Question button', 'Expand chevron'],
        ['update openFaqId', 'toggle faqItem.isOpen'],
        ['faqItem'],
        ['Answer panel opens', 'Chevron state changes'],
        ['useState(openFaqId)', 'setOpenFaqId(id)', 'faqItems.map(...)'],
      ),
    );
  }

  return {
    entities,
    flows,
    globalStateRequirements: uniqueStrings([
      'useState(activeSection) for CTA navigation or scroll targeting.',
      'useState(activePreviewTab) for product preview tabs.',
      includePricing ? 'useState(billingPeriod) to toggle pricing content.' : null,
      includeFaq ? 'useState(openFaqId) for FAQ accordion behavior.' : null,
    ]),
    navigationRules: [
      {
        from: hero.id,
        to: preview.id,
        trigger: 'Primary hero CTA',
        expectedBehavior: `Scroll or route to ${preview.id} so the CTA has an obvious next step.`,
      },
      {
        from: preview.id,
        to: cta.id,
        trigger: 'Secondary signup CTA',
        expectedBehavior: `Move the visitor to ${cta.id} or signup state instead of leaving the CTA decorative.`,
      },
    ],
    functionalNotes: uniqueStrings([
      ...COMMON_FUNCTIONAL_NOTES,
      'Decorative marketing CTAs are allowed only when they are clearly secondary to the primary conversion path.',
      input.productType ? `Functional plan anchored to productType=${input.productType}.` : null,
    ]),
  };
}

function buildSocialPlan(input: {
  screens: ScreenRef[];
  productType?: string;
}): Pick<FunctionalFlowPlan, 'entities' | 'flows' | 'globalStateRequirements' | 'navigationRules' | 'functionalNotes'> {
  const feed = findScreen(input.screens, ['feed', 'home'], 0);
  const discover = findScreen(input.screens, ['discover'], 1);
  const profile = findScreen(input.screens, ['profile'], 2);
  const create = findScreen(input.screens, ['create'], input.screens.length - 1);
  const messages = findScreen(input.screens, ['message'], 3);

  return {
    entities: [
      makeEntity('post', 'Post', 8, [
        { name: 'id', type: 'string', example: 'post-1' },
        { name: 'author', type: 'string', example: 'Lina' },
        { name: 'content', type: 'string', example: 'New walking route in the park today.' },
        { name: 'liked', type: 'boolean', example: 'false' },
        { name: 'saved', type: 'boolean', example: 'true' },
      ]),
      makeEntity('profileState', 'Profile State', 4, [
        { name: 'id', type: 'string', example: 'user-1' },
        { name: 'isFollowing', type: 'boolean', example: 'true' },
        { name: 'followers', type: 'number', example: '248' },
        { name: 'savedPostIds', type: 'array', example: '2 ids' },
      ]),
      makeEntity('composeDraft', 'Compose Draft', 1, [
        { name: 'text', type: 'string', example: 'Sharing today\'s update...' },
        { name: 'visibility', type: 'enum', example: 'community' },
      ]),
      makeEntity('conversation', 'Conversation', 5, [
        { name: 'id', type: 'string', example: 'dm-1' },
        { name: 'participant', type: 'string', example: 'Noah' },
        { name: 'lastMessage', type: 'string', example: 'See you there!' },
        { name: 'unread', type: 'boolean', example: 'false' },
      ]),
    ],
    flows: [
      makeFlow(
        'feed-filter-switch',
        'Switch feed filters or tabs',
        feed.id,
        'Changing tabs or filters must swap the visible feed content.',
        ['Feed tab', 'Following filter', 'Trending filter'],
        ['update activeFeedFilter', 'derive visible posts'],
        ['post'],
        ['Feed cards change', 'Active filter highlight updates'],
        ['useState(activeFeedFilter)', 'setActiveFeedFilter(filterId)', 'posts.filter(...)'],
      ),
      makeFlow(
        'create-post',
        'Create a new post locally',
        create.id,
        'Submit a post draft and add it to the feed immediately.',
        ['Create post button', 'Post submit button', 'Compose CTA'],
        ['append post', 'clear composeDraft', 'switch back to feed'],
        ['post', 'composeDraft'],
        ['New post appears at the top of the feed', 'Draft resets', 'Success state shows'],
        ['useState(posts)', 'onSubmit(handleCreatePost)', 'setPosts([nextPost, ...posts])'],
        feed.id,
      ),
      makeFlow(
        'like-save-follow',
        'React to content and profiles',
        feed.id,
        'Like, save, and follow actions should update local counts and states.',
        ['Like button', 'Save button', 'Follow button'],
        ['toggle post.liked', 'toggle post.saved', 'toggle profileState.isFollowing'],
        ['post', 'profileState'],
        ['Button style changes', 'Count badges update', 'Saved state persists in the session'],
        ['setPosts(posts.map(...))', 'setProfileState({ ...profileState, isFollowing: !profileState.isFollowing })', 'derived count updates'],
      ),
      makeFlow(
        'community-navigation',
        'Navigate between feed, discover, profile, and messages',
        feed.id,
        'Bottom navigation or top chips should switch the visible community surface.',
        ['Bottom nav Feed', 'Discover nav item', 'Profile nav item', 'Messages nav item'],
        ['update activeScreen', 'update selectedConversationId'],
        ['conversation'],
        ['Main content changes', 'Selected nav item updates'],
        ['useState(activeScreen)', 'setActiveScreen(screenId)', 'conditional view rendering'],
        discover.id,
      ),
      makeFlow(
        'message-compose',
        'Open a conversation and send a local message',
        messages.id,
        'Message actions should update a local thread without calling an API.',
        ['Conversation row', 'Send button', 'Reply input'],
        ['setSelectedConversationId', 'append message', 'clear message draft'],
        ['conversation'],
        ['Conversation detail opens', 'Thread updates', 'Last message preview changes'],
        ['useState(selectedConversationId)', 'setConversations(items.map(...))', 'setMessageDraft(\'\')'],
      ),
    ],
    globalStateRequirements: [
      'useState(activeScreen) for feed, discover, profile, and messages navigation.',
      'useState(activeFeedFilter) for feed tab or filter switching.',
      'useState(posts) for create, like, and save actions.',
      'useState(composeDraft) for post composition.',
      'useState(profileState) for follow and save state.',
      'useState(selectedConversationId) for message detail switching.',
    ],
    navigationRules: [
      {
        from: feed.id,
        to: discover.id,
        trigger: 'Discover nav item',
        expectedBehavior: `Switch to ${discover.id} and show search or trending content.`,
      },
      {
        from: feed.id,
        to: profile.id,
        trigger: 'Profile nav item',
        expectedBehavior: `Switch to ${profile.id} and preserve post and follow state.`,
      },
      {
        from: feed.id,
        to: messages.id,
        trigger: 'Messages nav item',
        expectedBehavior: `Switch to ${messages.id} and allow selecting a conversation thread.`,
      },
      {
        from: feed.id,
        to: create.id,
        trigger: 'Create post floating action or inline composer',
        expectedBehavior: `Open ${create.id} or inline compose state and return the created post to the feed.`,
      },
    ],
    functionalNotes: uniqueStrings([
      ...COMMON_FUNCTIONAL_NOTES,
      'Create, like, save, follow, filter, and navigation interactions should all have visible local results.',
      input.productType ? `Functional plan anchored to productType=${input.productType}.` : null,
    ]),
  };
}

function buildEcommercePlan(input: {
  screens: ScreenRef[];
  productType?: string;
}): Pick<FunctionalFlowPlan, 'entities' | 'flows' | 'globalStateRequirements' | 'navigationRules' | 'functionalNotes'> {
  const storefront = findScreen(input.screens, ['storefront'], 0);
  const detail = findScreen(input.screens, ['detail', 'product'], 1);
  const cart = findScreen(input.screens, ['cart'], 2);
  const checkout = findScreen(input.screens, ['checkout'], 3);
  const profile = findScreen(input.screens, ['profile'], input.screens.length - 1);

  return {
    entities: [
      makeEntity('product', 'Product', 10, [
        { name: 'id', type: 'string', example: 'product-1' },
        { name: 'name', type: 'string', example: 'Trail running shoes' },
        { name: 'price', type: 'number', example: '129' },
        { name: 'category', type: 'enum', example: 'footwear' },
        { name: 'inStock', type: 'boolean', example: 'true' },
      ]),
      makeEntity('cartItem', 'Cart Item', 4, [
        { name: 'id', type: 'string', example: 'cart-1' },
        { name: 'productId', type: 'string', example: 'product-1' },
        { name: 'quantity', type: 'number', example: '2' },
        { name: 'lineTotal', type: 'number', example: '258' },
      ]),
      makeEntity('checkoutDraft', 'Checkout Draft', 1, [
        { name: 'email', type: 'string', example: 'buyer@example.com' },
        { name: 'shippingMethod', type: 'enum', example: 'express' },
        { name: 'confirmed', type: 'boolean', example: 'false' },
      ]),
    ],
    flows: [
      makeFlow(
        'category-filter',
        'Filter visible products by category or search',
        storefront.id,
        'Category shortcuts and search should change the visible product grid.',
        ['Category chip', 'Search input', 'Sort control'],
        ['update selectedCategory', 'update searchQuery', 'derive filtered products'],
        ['product'],
        ['Product cards change', 'Result count updates', 'Selected filter highlights'],
        ['useState(selectedCategory)', 'useState(searchQuery)', 'products.filter(...)'],
      ),
      makeFlow(
        'product-detail-open',
        'Open a product detail view',
        storefront.id,
        'Clicking a product card should reveal the chosen product detail screen or panel.',
        ['Product card', 'View details button', 'Featured item click'],
        ['setSelectedProductId', 'setSelectedProduct'],
        ['product'],
        ['Detail content updates', 'Selected product state changes'],
        ['useState(selectedProductId)', 'setSelectedProductId(product.id)', 'conditional detail rendering'],
        detail.id,
      ),
      makeFlow(
        'add-to-cart',
        'Add a product to cart',
        detail.id,
        'Add to cart should change cart count and visible cart contents.',
        ['Add to cart button', 'Quick add button'],
        ['append cart item', 'increment cart quantity', 'recompute cart count'],
        ['product', 'cartItem'],
        ['Cart badge updates', 'Cart drawer or summary updates', 'CTA state changes'],
        ['useState(cartItems)', 'setCartItems([...cartItems, nextCartItem])', 'useMemo(cartCount)'],
        cart.id,
      ),
      makeFlow(
        'cart-quantity-update',
        'Update cart quantities and totals',
        cart.id,
        'Quantity steppers and remove controls should update totals immediately.',
        ['Quantity stepper', 'Remove item button', 'Cart quantity input'],
        ['update cartItem.quantity', 'remove cart item', 'recompute subtotal and total'],
        ['cartItem'],
        ['Line totals change', 'Order summary updates', 'Empty state appears when cart is cleared'],
        ['setCartItems(items.map(...))', 'setCartItems(items.filter(...))', 'cartItems.reduce(...)'],
      ),
      makeFlow(
        'checkout-confirmation',
        'Submit checkout locally',
        checkout.id,
        'Checkout should show a submitted or confirmed state without requiring a backend.',
        ['Checkout button', 'Place order button', 'Confirm order button'],
        ['update checkoutDraft', 'set order confirmed state', 'clear cart after confirmation'],
        ['checkoutDraft', 'cartItem'],
        ['Confirmation card appears', 'Cart total resets or order summary locks', 'Button label changes'],
        ['useState(checkoutDraft)', 'onSubmit(handleCheckout)', 'setOrderConfirmed(true)'],
        profile.id,
      ),
    ],
    globalStateRequirements: [
      'useState(selectedCategory) and useState(searchQuery) for storefront filtering.',
      'useState(selectedProductId) for product detail navigation.',
      'useState(cartItems) for add-to-cart and quantity changes.',
      'useMemo(cartTotals) for subtotal, shipping, and final totals.',
      'useState(checkoutDraft) and useState(orderConfirmed) for checkout completion.',
    ],
    navigationRules: [
      {
        from: storefront.id,
        to: detail.id,
        trigger: 'Product card click',
        expectedBehavior: `Open ${detail.id} with the selected product data.`,
      },
      {
        from: detail.id,
        to: cart.id,
        trigger: 'Add to cart CTA or cart badge',
        expectedBehavior: `Navigate or switch state to ${cart.id} and show the updated cart summary.`,
      },
      {
        from: cart.id,
        to: checkout.id,
        trigger: 'Checkout button',
        expectedBehavior: `Open ${checkout.id} or checkout confirmation state with the current cart totals.`,
      },
    ],
    functionalNotes: uniqueStrings([
      ...COMMON_FUNCTIONAL_NOTES,
      'Category filters, product detail, cart updates, and checkout confirmation must feel like a working store demo.',
      input.productType ? `Functional plan anchored to productType=${input.productType}.` : null,
    ]),
  };
}

function buildFallbackPlan(input: {
  skeletonId: string;
  screens: ScreenRef[];
  productType?: string;
}): Pick<FunctionalFlowPlan, 'entities' | 'flows' | 'globalStateRequirements' | 'navigationRules' | 'functionalNotes'> {
  const main = input.screens[0] ?? { id: 'main', title: 'Main', routeHint: '/', role: 'home' };
  const secondary = input.screens[1] ?? { id: 'secondary', title: 'Secondary', routeHint: '/secondary', role: 'other' };

  return {
    entities: [
      makeEntity('item', 'Item', 5, [
        { name: 'id', type: 'string', example: 'item-1' },
        { name: 'title', type: 'string', example: 'Primary record' },
        { name: 'status', type: 'enum', example: 'active' },
      ]),
    ],
    flows: [
      makeFlow(
        'primary-action',
        'Run the primary action with visible local feedback',
        main.id,
        'Primary calls to action should update local state instead of staying decorative.',
        ['Primary button', 'Main CTA'],
        ['update item state', 'select current item'],
        ['item'],
        ['Visible content changes', 'Status changes'],
        ['useState(items)', 'setItems(items.map(...))'],
      ),
      makeFlow(
        'screen-navigation',
        'Navigate between main views',
        main.id,
        'Navigation controls should change the rendered view.',
        ['Navigation control', 'Tab', 'Menu item'],
        ['update activeScreen'],
        [],
        ['Secondary view becomes visible', 'Selected navigation state updates'],
        ['useState(activeScreen)', 'setActiveScreen(screenId)', 'conditional view rendering'],
        secondary.id,
      ),
    ],
    globalStateRequirements: [
      'useState(activeScreen) for navigation.',
      'useState(items) for local create or update flows.',
    ],
    navigationRules: [
      {
        from: main.id,
        to: secondary.id,
        trigger: 'Navigation control',
        expectedBehavior: `Change the visible screen to ${secondary.id} with local state.`,
      },
    ],
    functionalNotes: uniqueStrings([
      ...COMMON_FUNCTIONAL_NOTES,
      `Fallback functional plan for ${input.productType ?? input.skeletonId}.`,
    ]),
  };
}

export function buildFunctionalFlowPlan(input: {
  brief: string;
  skeletonId: string;
  screenCompositionPlan?: ScreenCompositionPlan;
  architectPlan?: unknown;
}): FunctionalFlowPlan {
  const screens = getScreens(input.skeletonId, input.screenCompositionPlan);
  const productType = deriveProductType(input);
  const primaryUserGoal = inferPrimaryUserGoal({
    brief: input.brief,
    skeletonId: input.skeletonId,
    productType,
  });

  const planBySkeleton =
    input.skeletonId === 'mobile-app'
      ? buildMobilePlan({ brief: input.brief, screens, productType })
      : input.skeletonId === 'saas-dashboard' || input.skeletonId === 'productivity-tool'
        ? buildSaasPlan({ screens, skeletonId: input.skeletonId, productType })
        : input.skeletonId === 'landing-page'
          ? buildLandingPlan({ brief: input.brief, screens, productType })
          : input.skeletonId === 'social-community'
            ? buildSocialPlan({ screens, productType })
            : input.skeletonId === 'ecommerce'
              ? buildEcommercePlan({ screens, productType })
              : buildFallbackPlan({ skeletonId: input.skeletonId, screens, productType });

  const architectDataModel =
    input.architectPlan && typeof input.architectPlan === 'object' && 'dataModel' in input.architectPlan
      ? (input.architectPlan as { dataModel?: unknown }).dataModel
      : undefined;

  return {
    productType,
    skeletonId: input.skeletonId,
    primaryUserGoal,
    entities: planBySkeleton.entities,
    flows: planBySkeleton.flows,
    globalStateRequirements: uniqueStrings(planBySkeleton.globalStateRequirements),
    navigationRules: planBySkeleton.navigationRules,
    nonDecorativeRules: [...NON_DECORATIVE_RULES],
    functionalNotes: uniqueStrings([
      ...planBySkeleton.functionalNotes,
      typeof architectDataModel === 'string' && architectDataModel.trim()
        ? `Architect data model hint: ${architectDataModel.trim()}`
        : null,
    ]),
  };
}

export function buildFunctionalFlowPromptBlock(plan: FunctionalFlowPlan): string {
  const lines: string[] = [];

  lines.push('FUNCTIONAL_FLOW_PLAN:');
  lines.push(`primaryUserGoal: ${plan.primaryUserGoal}`);
  if (plan.productType) lines.push(`productType: ${plan.productType}`);
  lines.push(`skeletonId: ${plan.skeletonId}`);
  lines.push('');

  lines.push('GLOBAL_STATE_REQUIREMENTS:');
  for (const requirement of plan.globalStateRequirements) {
    lines.push(`  - ${requirement}`);
  }
  lines.push('');

  lines.push('DATA_ENTITIES:');
  for (const entity of plan.entities) {
    lines.push(`  - id: ${entity.id}`);
    lines.push(`    label: ${entity.label}`);
    lines.push(`    sampleCount: ${entity.sampleCount}`);
    lines.push('    fields:');
    for (const field of entity.fields) {
      lines.push(`      - ${field.name} (${field.type}) example=${field.example}`);
    }
  }
  lines.push('');

  lines.push('FLOWS:');
  for (const flow of plan.flows) {
    lines.push(`  - id: ${flow.id}`);
    lines.push(`    title: ${flow.title}`);
    lines.push(`    screenId: ${flow.screenId}`);
    lines.push(`    userIntent: ${flow.userIntent}`);
    lines.push(`    triggerElements: ${flow.triggerElements.join(', ')}`);
    lines.push(`    stateChanges: ${flow.stateChanges.join(', ')}`);
    lines.push(`    affectedEntities: ${flow.affectedEntities.join(', ') || '(none)'}`);
    lines.push(`    visibleFeedback: ${flow.visibleFeedback.join(', ')}`);
    if (flow.navigationTarget) lines.push(`    navigationTarget: ${flow.navigationTarget}`);
    lines.push(`    requiredImplementation: ${flow.requiredImplementation.join(', ')}`);
  }
  lines.push('');

  lines.push('NAVIGATION_RULES:');
  for (const rule of plan.navigationRules) {
    lines.push(`  - from: ${rule.from}`);
    lines.push(`    to: ${rule.to}`);
    lines.push(`    trigger: ${rule.trigger}`);
    lines.push(`    expectedBehavior: ${rule.expectedBehavior}`);
  }
  lines.push('');

  lines.push('NON_DECORATIVE_RULES:');
  for (const rule of plan.nonDecorativeRules) {
    lines.push(`  - ${rule}`);
  }
  lines.push('');

  lines.push('FUNCTIONAL_NOTES:');
  for (const note of plan.functionalNotes) {
    lines.push(`  - ${note}`);
  }
  lines.push('');

  lines.push('CODER_INSTRUCTIONS:');
  lines.push('- Implement this functional flow plan with local React state, derived data, and simple handlers.');
  lines.push('- Keep it lightweight and deterministic.');
  lines.push('- Do not introduce backend requirements.');
  lines.push('- Do not use external APIs.');
  lines.push('- Do not overbuild persistence.');
  lines.push('- Use mock data where needed.');
  lines.push('- Make the generated prototype feel clickable and demo-ready.');

  return lines.join('\n');
}

function normalizeOutputPath(path: string): string {
  return path.replace(/^src[\\/]/, '').replace(/\\/g, '/');
}

function isMeaningfulScreenFile(path: string): boolean {
  const normalized = normalizeOutputPath(path);
  if (!/\.tsx$/.test(normalized)) return false;
  if (normalized === 'App.tsx') return true;
  return /^(pages|screens|components\/screens)\/[^/]+\.tsx$/.test(normalized);
}

function extractImportedDataFiles(files: Record<string, string>): Set<string> {
  const imported = new Set<string>();
  for (const [path, content] of Object.entries(files)) {
    if (!isMeaningfulScreenFile(path)) continue;
    const matches = content.matchAll(/from\s+['"](@\/data\/[^'"]+|\.\.?\/data\/[^'"]+)['"]/g);
    for (const match of matches) {
      const raw = (match[1] ?? '').trim();
      if (!raw) continue;
      if (raw.startsWith('@/data/')) {
        const modulePath = raw.slice(7).replace(/\.(?:ts|tsx)$/, '');
        imported.add(`data/${modulePath}.ts`);
        imported.add(`data/${modulePath}.tsx`);
      }
    }
  }
  return imported;
}

function isFunctionalScanFile(path: string, importedDataFiles: Set<string>): boolean {
  const normalized = normalizeOutputPath(path);
  if (!/\.tsx?$/.test(normalized)) return false;
  if (normalized.startsWith('design-pack/')) return false;
  if (normalized.startsWith('assets/generated/')) return false;
  if (normalized.includes('__tests__/')) return false;
  if (/\.(?:test|spec)\.tsx?$/.test(normalized)) return false;
  if (normalized.startsWith('data/') && !importedDataFiles.has(normalized)) return false;
  return true;
}

function countMatches(content: string, pattern: RegExp): number {
  const rx = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  return Array.from(content.matchAll(rx)).length;
}

function collectSignals(
  files: Array<[string, string]>,
  patterns: RegExp[],
): string[] {
  return uniqueStrings(
    files.flatMap(([path, content]) => {
      const normalizedPath = normalizeOutputPath(path);
      return patterns.flatMap((pattern) => {
        const rx = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
        return Array.from(content.matchAll(rx)).map(match => `${normalizedPath}: ${match[0]}`);
      });
    }),
  ).sort((a, b) => a.localeCompare(b));
}

function normalizeTerm(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_:/()[\],.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractSearchTerms(values: string[]): string[] {
  const terms = values.flatMap((value) => {
    const normalized = normalizeTerm(value);
    const identifiers = value.match(/[A-Za-z][A-Za-z0-9]+/g) ?? [];
    return [
      normalized,
      ...normalized.split(/\s+/),
      ...identifiers.map(identifier => identifier.toLowerCase()),
    ];
  });

  return uniqueStrings(
    terms.map(term => term.trim()).filter(term => {
      if (!term || term.length < 3) return false;
      if (STOP_WORDS.has(term)) return false;
      return true;
    }),
  );
}

function flowEvidenceCount(
  flow: FunctionalFlow,
  aggregateSource: string,
  entityMap: Map<string, FunctionalDataEntity>,
): number {
  const triggerTerms = extractSearchTerms(flow.triggerElements);
  const stateTerms = extractSearchTerms(flow.stateChanges);
  const requiredTerms = extractSearchTerms(flow.requiredImplementation);
  const feedbackTerms = extractSearchTerms(flow.visibleFeedback);
  const entityTerms = extractSearchTerms(
    flow.affectedEntities.flatMap((entityId) => {
      const entity = entityMap.get(entityId);
      return entity
        ? [entity.id, entity.label, ...entity.fields.map(field => field.name)]
        : [entityId];
    }),
  );

  const hits = new Set<string>();
  if (triggerTerms.some(term => aggregateSource.includes(term))) hits.add('trigger');
  if (stateTerms.some(term => aggregateSource.includes(term))) hits.add('state');
  if (requiredTerms.some(term => aggregateSource.includes(term))) hits.add('required');
  if (feedbackTerms.some(term => aggregateSource.includes(term))) hits.add('feedback');
  if (entityTerms.some(term => aggregateSource.includes(term))) hits.add('entity');
  if (flow.navigationTarget && aggregateSource.includes(flow.navigationTarget.toLowerCase())) hits.add('navigation');
  return hits.size;
}

export function buildFunctionalImplementationDiagnostics(input: {
  files: Record<string, string>;
  plan: FunctionalFlowPlan;
}): FunctionalImplementationDiagnostics {
  const importedDataFiles = extractImportedDataFiles(input.files);
  const fileEntries = Object.entries(input.files).filter(([path]) => isFunctionalScanFile(path, importedDataFiles));
  const aggregateSource = fileEntries.map(([, content]) => content.toLowerCase()).join('\n');

  const stateHookCount = fileEntries.reduce((count, [, content]) => count + countMatches(content, /\buseState\s*\(/g), 0);
  const reducerHookCount = fileEntries.reduce((count, [, content]) => count + countMatches(content, /\buseReducer\s*\(/g), 0);
  const handlerCount = fileEntries.reduce((count, [, content]) => count + countMatches(content, /\bon(?:Click|Submit|Change)\s*=/g), 0);
  const emptyHandlerCount = fileEntries.reduce((count, [, content]) => (
    count
    + countMatches(content, /\bonClick\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/g)
    + countMatches(content, /\bonSubmit\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/g)
    + countMatches(content, /\bonClick\s*=\s*\{\s*undefined\s*\}/g)
    + countMatches(content, /\bonSubmit\s*=\s*\{\s*undefined\s*\}/g)
  ), 0);
  const formCount = fileEntries.reduce((count, [, content]) => count + countMatches(content, /<form\b/gi), 0);
  const controlledInputCount = fileEntries.reduce((count, [, content]) => (
    count + countMatches(content, /<(?:input|textarea|select|Input|Textarea|Select)\b[^>]*\bvalue=\{/g)
  ), 0);
  const submitHandlerCount = fileEntries.reduce((count, [, content]) => {
    const total = countMatches(content, /\bonSubmit\s*=/g);
    const empty = countMatches(content, /\bonSubmit\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/g)
      + countMatches(content, /\bonSubmit\s*=\s*\{\s*undefined\s*\}/g);
    return count + Math.max(0, total - empty);
  }, 0);

  const searchOrFilterSignals = collectSignals(fileEntries, [
    /\b(?:search|query|filter|filtered|activeStatus|setQuery|setSearchQuery|setFilter|selectedCategory|selectedFilter)\b/g,
    /\.filter\s*\(/g,
  ]);
  const tabStateSignals = collectSignals(fileEntries, [
    /\b(?:activeTab|selectedTab|setActiveTab|setSelectedTab|previewTab|billingPeriod|openFaqId)\b/g,
    /TabsTrigger/g,
  ]);
  const navigationSignals = collectSignals(fileEntries, [
    /\b(?:activeScreen|activeView|setActiveScreen|setActiveView|selectedItemId|setSelectedItemId|navigate|Link|NavLink|BottomTabs)\b/g,
    /scrollIntoView\s*\(/g,
  ]);
  const localCreateUpdateSignals = collectSignals(fileEntries, [
    /\bset[A-Z][A-Za-z0-9]*\s*\(\s*\[[^\]]*\.\.\./g,
    /\bset[A-Z][A-Za-z0-9]*\s*\(\s*[A-Za-z0-9_]+\.(?:map|filter)\s*\(/g,
    /\bset(?:Cart|Completed|Selected|Open|Items|Posts|Products|Messages|Preferences|Habits)\b/g,
  ]);
  const derivedDataSignals = collectSignals(fileEntries, [
    /\.reduce\s*\(/g,
    /\.filter\s*\(/g,
    /\buseMemo\s*\(/g,
    /\b(?:completionRate|progressSummary|kpi|total|totals|summary)\b/g,
  ]);

  const entityMap = new Map(input.plan.entities.map(entity => [entity.id, entity]));
  const flowsWithLikelyImplementation: string[] = [];
  const flowsWithoutImplementationSignals: string[] = [];

  for (const flow of input.plan.flows) {
    const evidenceCount = flowEvidenceCount(flow, aggregateSource, entityMap);
    if (evidenceCount >= 2) {
      flowsWithLikelyImplementation.push(flow.id);
    } else {
      flowsWithoutImplementationSignals.push(flow.id);
    }
  }

  const decorativeInteractionWarnings = uniqueStrings([
    emptyHandlerCount > 0 ? `${emptyHandlerCount} empty click or submit handler(s) detected.` : null,
    aggregateSource.includes('onclick={() => {}}') ? 'Found empty onClick handlers.' : null,
    aggregateSource.includes('onsubmit={() => {}}') ? 'Found empty onSubmit handlers.' : null,
    aggregateSource.includes('alert(') ? 'alert() appears in generated source; core flows should do more than show alerts.' : null,
    /\bcoming soon\b/i.test(aggregateSource) ? 'Found "Coming soon" placeholder text.' : null,
    /\btodo\b/i.test(aggregateSource) ? 'Found TODO markers in generated source.' : null,
    /\bnot implemented\b/i.test(aggregateSource) ? 'Found "Not implemented" placeholder text.' : null,
    /<(?:input|Input)\b[^>]*(?:search|Search)/.test(aggregateSource) && searchOrFilterSignals.length === 0
      ? 'Search input detected without obvious filtering logic.'
      : null,
    /(TabsTrigger|tab)/.test(fileEntries.map(([, content]) => content).join('\n')) && tabStateSignals.length === 0
      ? 'Possible static tabs detected without active tab state.'
      : null,
    formCount > 0 && submitHandlerCount === 0 ? 'Form markup detected without submit handling.' : null,
    formCount > 0 && controlledInputCount === 0 ? 'Form inputs detected without controlled input state.' : null,
  ]).sort((a, b) => a.localeCompare(b));

  const plannedFlowCount = input.plan.flows.length;
  const implementationCoverageRatio = plannedFlowCount > 0
    ? flowsWithLikelyImplementation.length / plannedFlowCount
    : 0;
  const manyEmptyHandlers = emptyHandlerCount >= 2;
  const suggestedNextAction: FunctionalImplementationDiagnostics['suggestedNextAction'] =
    implementationCoverageRatio < 0.4 || manyEmptyHandlers
      ? 'add_repair_later'
      : implementationCoverageRatio < 0.7 || decorativeInteractionWarnings.length > 0
        ? 'improve_prompt'
        : 'none';

  return {
    functionalDiagnosticsChecked: true,
    plannedFlowCount,
    flowsWithLikelyImplementation: flowsWithLikelyImplementation.sort((a, b) => a.localeCompare(b)),
    flowsWithoutImplementationSignals: flowsWithoutImplementationSignals.sort((a, b) => a.localeCompare(b)),
    stateHookCount,
    reducerHookCount,
    handlerCount,
    emptyHandlerCount,
    formCount,
    controlledInputCount,
    submitHandlerCount,
    searchOrFilterSignals,
    tabStateSignals,
    navigationSignals,
    localCreateUpdateSignals,
    derivedDataSignals,
    decorativeInteractionWarnings,
    implementationCoverageRatio,
    suggestedNextAction,
  };
}

export function serializeFunctionalFlowPlan(plan: FunctionalFlowPlan): FunctionalFlowPlanTelemetry {
  return {
    product_type: plan.productType,
    skeleton_id: plan.skeletonId,
    primary_user_goal: plan.primaryUserGoal,
    entity_count: plan.entities.length,
    flow_count: plan.flows.length,
    entities: plan.entities.map(entity => ({
      id: entity.id,
      label: entity.label,
      sample_count: entity.sampleCount,
      fields: entity.fields.map(field => ({
        name: field.name,
        type: field.type,
        example: field.example,
      })),
    })),
    flows: plan.flows.map(flow => ({
      id: flow.id,
      title: flow.title,
      screen_id: flow.screenId,
      user_intent: flow.userIntent,
      trigger_elements: flow.triggerElements,
      state_changes: flow.stateChanges,
      affected_entities: flow.affectedEntities,
      visible_feedback: flow.visibleFeedback,
      navigation_target: flow.navigationTarget,
      required_implementation: flow.requiredImplementation,
    })),
    navigation_rules: plan.navigationRules.map(rule => ({
      from: rule.from,
      to: rule.to,
      trigger: rule.trigger,
      expected_behavior: rule.expectedBehavior,
    })),
    non_decorative_rules: [...plan.nonDecorativeRules],
    functional_notes: [...plan.functionalNotes],
  };
}

export function serializeFunctionalImplementationDiagnostics(
  diagnostics: FunctionalImplementationDiagnostics,
): FunctionalImplementationDiagnosticsTelemetry {
  return {
    functional_diagnostics_checked: diagnostics.functionalDiagnosticsChecked,
    planned_flow_count: diagnostics.plannedFlowCount,
    flows_with_likely_implementation: diagnostics.flowsWithLikelyImplementation,
    flows_without_implementation_signals: diagnostics.flowsWithoutImplementationSignals,
    state_hook_count: diagnostics.stateHookCount,
    reducer_hook_count: diagnostics.reducerHookCount,
    handler_count: diagnostics.handlerCount,
    empty_handler_count: diagnostics.emptyHandlerCount,
    form_count: diagnostics.formCount,
    controlled_input_count: diagnostics.controlledInputCount,
    submit_handler_count: diagnostics.submitHandlerCount,
    search_or_filter_signals: diagnostics.searchOrFilterSignals,
    tab_state_signals: diagnostics.tabStateSignals,
    navigation_signals: diagnostics.navigationSignals,
    local_create_update_signals: diagnostics.localCreateUpdateSignals,
    derived_data_signals: diagnostics.derivedDataSignals,
    decorative_interaction_warnings: diagnostics.decorativeInteractionWarnings,
    implementation_coverage_ratio: diagnostics.implementationCoverageRatio,
    suggested_next_action: diagnostics.suggestedNextAction,
  };
}
