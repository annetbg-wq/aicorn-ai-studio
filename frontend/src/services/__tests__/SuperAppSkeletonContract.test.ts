import { describe, expect, it } from 'vitest';
import { evaluateAppFirstQualityGate } from '../AppFirstQualityGate';
import { compileSkeletonContract } from '../SkeletonContractCompiler';
import { SKELETON_REGISTRY } from '../SkeletonRegistry';

const superFiles = {
  'config/app.ts': "export const APP_CONFIG = { name: 'Life Atlas' } as const;",
  'config/routes.ts': "export const ROUTES = { onboarding:'/onboarding', home:'/home', finance:'/finance', wellness:'/wellness', learning:'/learning', profile:'/profile' } as const;",
  'config/navigation.ts': "import { ROUTES } from './routes'; export const BOTTOM_TABS = [{to:ROUTES.home},{to:ROUTES.finance},{to:ROUTES.wellness},{to:ROUTES.learning},{to:ROUTES.profile}];",
  'data/types.ts': "export type DomainId = 'finance'|'wellness'|'learning'; export interface DomainItem { id:string; domain:DomainId; title:string; value:number }",
  'data/seed.ts': "import type { DomainItem } from './types'; export const ITEMS: DomainItem[] = [{id:'m',domain:'finance',title:'Budget',value:1},{id:'w',domain:'wellness',title:'Water',value:5},{id:'l',domain:'learning',title:'Spanish',value:10}];",
  'pages/Onboarding.tsx': "import { useApp } from '@/context/AppContext'; export default function Onboarding(){ const {completeOnboarding}=useApp(); return <section><h1>Welcome</h1><button onClick={()=>completeOnboarding({name:'A',goal:'Balance life'})}>Start</button></section> }",
  'pages/Home.tsx': "import { Link } from 'react-router-dom'; import { ITEMS } from '../data/seed'; import { ROUTES } from '../config/routes'; export default function Home(){ return <section><h1>Hub</h1><p>{ITEMS.length}</p><Link to={ROUTES.finance}>Money</Link><Link to={ROUTES.wellness}>Wellness</Link><Link to={ROUTES.learning}>Learn</Link></section> }",
  'pages/Finance.tsx': "import { useState } from 'react'; import { ITEMS } from '../data/seed'; export default function Finance(){ const [n,setN]=useState(ITEMS[0].value); return <section><h1>Money</h1><p>{n}</p><button onClick={()=>setN(v=>v+1)}>Add expense</button></section> }",
  'pages/Wellness.tsx': "import { useState } from 'react'; import { ITEMS } from '../data/seed'; export default function Wellness(){ const [n,setN]=useState(ITEMS[1].value); return <section><h1>Wellness</h1><p>{n}</p><button onClick={()=>setN(v=>v+1)}>Log water</button></section> }",
  'pages/Learning.tsx': "import { useMemo } from 'react'; import { ITEMS } from '../data/seed'; export default function Learning(){ const n=useMemo(()=>ITEMS[2].value,[]); return <section><h1>Learning</h1><p>{n}</p><button onClick={()=>alert(n)}>Practice</button></section> }",
  'pages/Profile.tsx': "import { useState } from 'react'; import { ITEMS } from '../data/seed'; export default function Profile(){ const [on,setOn]=useState(true); return <section><h1>Profile</h1><p>{ITEMS.length}</p><button onClick={()=>setOn(v=>!v)}>Digest {String(on)}</button></section> }",
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
    expect(result.telemetry.meaningful_screen_count).toBeGreaterThanOrEqual(6);
    expect(result.telemetry.route_target_count).toBeGreaterThanOrEqual(6);
  });

  it('keeps ordinary mobile-app on that same manifest-driven profile', () => {
    expect(compileSkeletonContract('mobile-app').quality.profile).toBe('app-first');
  });
});
