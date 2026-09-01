import { describe, expect, it } from 'vitest';
import { evaluateAppFirstQualityGate } from '../AppFirstQualityGate';
import { compileSkeletonContract } from '../SkeletonContractCompiler';
import { SKELETON_REGISTRY } from '../SkeletonRegistry';

const screen = (name: string, body: string): string => `
export default function ${name}() {
  ${body}
}
`;

const superFiles = {
  'config/app.ts': "export const APP_CONFIG = { name: 'Life Atlas', tagline: 'One shared life hub' } as const;",
  'config/routes.ts': "export const ROUTES = { onboarding:'/onboarding', home:'/home', finance:'/finance', wellness:'/wellness', learning:'/learning', profile:'/profile' } as const;",
  'config/navigation.ts': "import { ROUTES } from './routes'; export const BOTTOM_TABS = [{to:ROUTES.home},{to:ROUTES.finance},{to:ROUTES.wellness},{to:ROUTES.learning},{to:ROUTES.profile}];",
  'data/types.ts': "export type DomainId = 'finance'|'wellness'|'learning'; export interface DomainItem { id:string; domain:DomainId; title:string; value:number; unit:string }",
  'data/seed.ts': "import type { DomainItem } from './types'; export const ITEMS: DomainItem[] = [{id:'m',domain:'finance',title:'Budget',value:1,unit:'USD'},{id:'w',domain:'wellness',title:'Water',value:5,unit:'glasses'},{id:'l',domain:'learning',title:'Spanish',value:10,unit:'minutes'}];",
  'pages/Onboarding.tsx': screen('Onboarding', `
    const completeOnboarding = (profile: { name: string; goal: string }) => profile;
    return (
      <section>
        <h1>Welcome to Life Atlas</h1>
        <p>Create one shared profile across every domain.</p>
        <button onClick={() => completeOnboarding({ name: 'Alex', goal: 'Balance life' })}>Start</button>
      </section>
    );
  `),
  'pages/Home.tsx': screen('Home', `
    const items = [{ title: 'Money' }, { title: 'Wellness' }, { title: 'Learning' }];
    return (
      <section>
        <h1>Life hub</h1>
        <p>Three connected domains in one app.</p>
        <a href="/finance">Money</a><a href="/wellness">Wellness</a><a href="/learning">Learning</a>
        <p>{items.length} active domains</p>
      </section>
    );
  `),
  'pages/Finance.tsx': `import { ITEMS } from '../data/seed';\n${screen('Finance', `
    const addExpense = () => ITEMS[0].value + 1;
    return (
      <section>
        <h1>Money</h1><p>{ITEMS[0].title}: {ITEMS[0].value}</p>
        <button onClick={addExpense}>Add expense</button>
      </section>
    );
  `)}`,
  'pages/Wellness.tsx': `import { ITEMS } from '../data/seed';\n${screen('Wellness', `
    const logWater = () => ITEMS[1].value + 1;
    return (
      <section>
        <h1>Wellness</h1><p>{ITEMS[1].title}: {ITEMS[1].value}</p>
        <button onClick={logWater}>Log water</button>
      </section>
    );
  `)}`,
  'pages/Learning.tsx': `import { ITEMS } from '../data/seed';\n${screen('Learning', `
    const completePractice = () => ITEMS[2].value + 10;
    return (
      <section>
        <h1>Learning</h1><p>{ITEMS[2].title}: {ITEMS[2].value}</p>
        <button onClick={completePractice}>Complete practice</button>
      </section>
    );
  `)}`,
  'pages/Profile.tsx': `import { ITEMS } from '../data/seed';\n${screen('Profile', `
    let digest = true;
    const toggleDigest = () => { digest = !digest; };
    return (
      <section>
        <h1>Shared profile</h1><p>{ITEMS.length} domains connected.</p>
        <button onClick={toggleDigest}>Toggle digest</button>
      </section>
    );
  `)}`,
};

describe('super-app first-class skeleton contract', () => {
  it('is a distinct registered skeleton with its own slots and app-first profile', () => {
    const contract = compileSkeletonContract('super-app');
    expect(SKELETON_REGISTRY['super-app'].id).toBe('super-app');
    expect(contract.id).toBe('super-app');
    expect(contract.quality.profile).toBe('app-first');
    expect(contract.quality.requiredCapabilities).toContain('multi-domain');
    expect(contract.requiredSlots).toContain('src/pages/Finance.tsx');
    expect(contract.requiredSlots).toContain('src/pages/Wellness.tsx');
    expect(contract.requiredSlots).toContain('src/pages/Learning.tsx');
    expect(contract.requiredSlots).not.toContain('src/pages/Create.tsx');
  });

  it('uses the same app-first quality evaluator rather than a super-app exception', () => {
    const result = evaluateAppFirstQualityGate({ skeletonId: 'super-app', files: superFiles });
    expect(result.telemetry.profile).toBe('app-first');
    expect(result.telemetry.checked).toBe(true);
    expect(result.telemetry.meaningful_screen_count).toBe(6);
    expect(result.telemetry.route_target_count).toBe(6);
    expect(result.telemetry.navigation_target_count).toBe(5);
    expect(result.telemetry.data_consumer_screen_count).toBeGreaterThanOrEqual(3);
    expect(result.telemetry.non_empty_action_handler_count).toBeGreaterThanOrEqual(4);
    expect(result.ok).toBe(true);
  });

  it('keeps ordinary mobile-app on that same manifest-driven profile', () => {
    expect(compileSkeletonContract('mobile-app').quality.profile).toBe('app-first');
  });
});
