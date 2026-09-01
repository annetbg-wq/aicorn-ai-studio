import { describe, expect, it } from 'vitest';
import { evaluateAppFirstQualityGate } from '../AppFirstQualityGate';
import type {
  FunctionalFlowPlan,
  FunctionalImplementationDiagnostics,
} from '../FunctionalFlowPlanner';

function functionalPlan(): FunctionalFlowPlan {
  return {
    productType: 'mobile-app',
    skeletonId: 'mobile-app',
    primaryUserGoal: 'Create an entry and see progress update.',
    entities: [
      {
        id: 'entry',
        label: 'Entry',
        sampleCount: 4,
        fields: [
          { name: 'id', type: 'string', example: 'entry-1' },
          { name: 'title', type: 'string', example: 'Groceries' },
        ],
      },
    ],
    flows: [
      {
        id: 'bottom-nav-switch',
        title: 'Switch screens',
        screenId: 'home',
        userIntent: 'Navigate',
        triggerElements: ['Bottom nav'],
        stateChanges: ['active screen'],
        affectedEntities: [],
        visibleFeedback: ['Screen changes'],
        navigationTarget: 'progress',
        requiredImplementation: ['ROUTES.progress'],
      },
      {
        id: 'create-entry',
        title: 'Create entry',
        screenId: 'create',
        userIntent: 'Create',
        triggerElements: ['Submit form'],
        stateChanges: ['append entry'],
        affectedEntities: ['entry'],
        visibleFeedback: ['Created state'],
        navigationTarget: 'detail',
        requiredImplementation: ['onSubmit', 'setEntries'],
      },
      {
        id: 'detail-status-update',
        title: 'Update detail',
        screenId: 'detail',
        userIntent: 'Update',
        triggerElements: ['Mark done'],
        stateChanges: ['update status'],
        affectedEntities: ['entry'],
        visibleFeedback: ['Status changes'],
        requiredImplementation: ['onClick'],
      },
      {
        id: 'progress-derived-summary',
        title: 'Progress',
        screenId: 'progress',
        userIntent: 'Review progress',
        triggerElements: ['Progress tab'],
        stateChanges: ['derive summary'],
        affectedEntities: ['entry'],
        visibleFeedback: ['Summary updates'],
        requiredImplementation: ['useMemo'],
      },
    ],
    globalStateRequirements: [],
    navigationRules: [
      { from: 'home', to: 'create', trigger: 'Add', expectedBehavior: 'Open create.' },
      { from: 'home', to: 'progress', trigger: 'Progress', expectedBehavior: 'Open progress.' },
      { from: 'create', to: 'detail', trigger: 'Submit', expectedBehavior: 'Open detail.' },
    ],
    nonDecorativeRules: [],
    functionalNotes: [],
  };
}

function diagnostics(overrides: Partial<FunctionalImplementationDiagnostics> = {}): FunctionalImplementationDiagnostics {
  return {
    functionalDiagnosticsChecked: true,
    plannedFlowCount: 4,
    flowsWithLikelyImplementation: ['bottom-nav-switch', 'create-entry', 'detail-status-update'],
    flowsWithoutImplementationSignals: ['progress-derived-summary'],
    stateHookCount: 4,
    reducerHookCount: 0,
    handlerCount: 5,
    emptyHandlerCount: 0,
    formCount: 1,
    controlledInputCount: 1,
    submitHandlerCount: 1,
    searchOrFilterSignals: [],
    tabStateSignals: [],
    navigationSignals: ['config/navigation.ts: ROUTES.home', 'pages/Home.tsx: Link'],
    localCreateUpdateSignals: ['pages/Create.tsx: setEntries'],
    derivedDataSignals: ['pages/Progress.tsx: useMemo'],
    decorativeInteractionWarnings: [],
    implementationCoverageRatio: 0.75,
    suggestedNextAction: 'none',
    ...overrides,
  };
}

function files(): Record<string, string> {
  return {
    'config/routes.ts': `export const ROUTES = { onboarding: '/onboarding', home: '/home', detail: '/detail/:id', create: '/create', progress: '/progress', profile: '/profile' } as const;`,
    'config/navigation.ts': `import { ROUTES } from './routes'; export const BOTTOM_TABS = [{to: ROUTES.home}, {to: ROUTES.create}, {to: ROUTES.progress}, {to: ROUTES.profile}] as const;`,
    'data/types.ts': `export interface Entry { id: string; title: string; done: boolean } export interface Progress { value: number }`,
    'data/seed.ts': `export const SEED_ENTRIES = [{ id: 'entry-1', title: 'Groceries', done: false }]; export const SEED_PROGRESS = [{ value: 72 }];`,
    'pages/Onboarding.tsx': `import { useApp } from '@/context/AppContext'; export default function Onboarding(){ const { completeOnboarding }=useApp(); return <section><h1>Welcome</h1><button onClick={()=>completeOnboarding({name:'Alex',goal:'Budget'})}>Start</button></section>; }`,
    'pages/Home.tsx': `import { Link } from 'react-router-dom'; import { SEED_ENTRIES } from '../data/seed'; import { ROUTES } from '../config/routes'; export default function Home(){ return <section><h1>Overview</h1><p>{SEED_ENTRIES[0].title}</p><Link to={ROUTES.create}>Add</Link></section>; }`,
    'pages/Create.tsx': `import { useState } from 'react'; import { SEED_ENTRIES } from '../data/seed'; export default function Create(){ const [entries,setEntries]=useState([...SEED_ENTRIES]); const [title,setTitle]=useState(''); return <section><h1>Create</h1><form onSubmit={e=>{e.preventDefault();setEntries([...entries,{id:'new',title,done:false}]);}}><input value={title} onChange={e=>setTitle(e.target.value)}/><button type='submit'>Save</button></form><p>{entries.length}</p></section>; }`,
    'pages/Detail.tsx': `import { useState } from 'react'; import { SEED_ENTRIES } from '../data/seed'; export default function Detail(){ const [done,setDone]=useState(SEED_ENTRIES[0].done); return <section><h1>Detail</h1><p>{SEED_ENTRIES[0].title}</p><button onClick={()=>setDone(!done)}>{done?'Done':'Mark done'}</button></section>; }`,
    'pages/Progress.tsx': `import { useMemo } from 'react'; import { SEED_ENTRIES } from '../data/seed'; export default function Progress(){ const completed=useMemo(()=>SEED_ENTRIES.filter(x=>x.done).length,[]); return <section><h1>Progress</h1><p>{completed} complete</p></section>; }`,
    'pages/Profile.tsx': `import { useState } from 'react'; import { APP_CONFIG } from '../config/app'; export default function Profile(){ const [enabled,setEnabled]=useState(true); return <section><h1>Profile</h1><p>{APP_CONFIG.name}</p><button onClick={()=>setEnabled(!enabled)}>{enabled?'On':'Off'}</button></section>; }`,
    'config/app.ts': `export const APP_CONFIG = { name: 'Pocket Ledger', tagline: 'Know where your money goes' } as const;`,
  };
}

const plan = {
  pages: [
    { path: '/onboarding', name: 'Onboarding', file: 'src/pages/Onboarding.tsx' },
    { path: '/home', name: 'Home', file: 'src/pages/Home.tsx' },
    { path: '/detail/:id', name: 'Detail', file: 'src/pages/Detail.tsx' },
    { path: '/create', name: 'Create', file: 'src/pages/Create.tsx' },
    { path: '/progress', name: 'Progress', file: 'src/pages/Progress.tsx' },
    { path: '/profile', name: 'Profile', file: 'src/pages/Profile.tsx' },
  ],
};

describe('evaluateAppFirstQualityGate', () => {
  it('passes a connected, data-backed, actionable mobile app', () => {
    const result = evaluateAppFirstQualityGate({
      skeletonId: 'mobile-app',
      files: files(),
      architectPlan: plan,
      functionalFlowPlan: functionalPlan(),
      functionalDiagnostics: diagnostics(),
    });

    expect(result.ok).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(result.telemetry.checked).toBe(true);
    expect(result.telemetry.meaningful_screen_count).toBeGreaterThanOrEqual(4);
    expect(result.telemetry.navigation_target_count).toBeGreaterThanOrEqual(3);
    expect(result.telemetry.data_consumer_screen_count).toBeGreaterThanOrEqual(2);
    expect(result.telemetry.non_empty_action_handler_count).toBeGreaterThanOrEqual(2);
    expect(result.telemetry.functional_flow_coverage_ratio).toBe(0.75);
  });

  it('fails static mobile output with no real actions even when screens exist', () => {
    const result = evaluateAppFirstQualityGate({
      skeletonId: 'mobile-app',
      files: files(),
      architectPlan: plan,
      functionalFlowPlan: functionalPlan(),
      functionalDiagnostics: diagnostics({
        handlerCount: 1,
        flowsWithLikelyImplementation: ['bottom-nav-switch'],
        flowsWithoutImplementationSignals: ['create-entry', 'detail-status-update', 'progress-derived-summary'],
        implementationCoverageRatio: 0.25,
        localCreateUpdateSignals: [],
        suggestedNextAction: 'add_repair_later',
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons.some(reason => /actions are insufficient/i.test(reason))).toBe(true);
    expect(result.repairInstructions.some(instruction => /create\/update action/i.test(instruction))).toBe(true);
  });

  it('fails when core screens are orphaned from the route/navigation graph', () => {
    const broken = files();
    broken['config/routes.ts'] = `export const ROUTES = { home: '/home', create: '/create' } as const;`;
    broken['config/navigation.ts'] = `import { ROUTES } from './routes'; export const BOTTOM_TABS = [{to: ROUTES.home}] as const;`;

    const result = evaluateAppFirstQualityGate({
      skeletonId: 'mobile-app',
      files: broken,
      architectPlan: plan,
      functionalFlowPlan: functionalPlan(),
      functionalDiagnostics: diagnostics(),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons.some(reason => /navigation graph is incomplete/i.test(reason))).toBe(true);
    expect(result.blockingReasons.some(reason => /connectivity is incomplete/i.test(reason))).toBe(true);
  });

  it('fails screen-only mobile output that has no usable product data', () => {
    const broken = files();
    delete broken['data/seed.ts'];
    delete broken['data/types.ts'];
    broken['pages/Home.tsx'] = `export default function Home(){ return <section><h1>Overview</h1><p>Static overview only.</p></section>; }`;
    broken['pages/Progress.tsx'] = `export default function Progress(){ return <section><h1>Progress</h1><p>Static progress only.</p></section>; }`;

    const result = evaluateAppFirstQualityGate({
      skeletonId: 'mobile-app',
      files: broken,
      architectPlan: plan,
      functionalFlowPlan: functionalPlan(),
      functionalDiagnostics: diagnostics(),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons.some(reason => /product data is too thin/i.test(reason))).toBe(true);
  });

  it('does not apply app-first semantics to landing pages', () => {
    const result = evaluateAppFirstQualityGate({
      skeletonId: 'landing-page',
      files: { 'App.tsx': `export default function App(){return <main><h1>Launch</h1></main>}` },
    });

    expect(result.ok).toBe(true);
    expect(result.telemetry.checked).toBe(false);
    expect(result.telemetry.profile).toBe('not-app-first');
  });
});
