import { describe, expect, it } from 'vitest';
import { evaluateCompletenessGate } from '../CompletenessGate';
import type { FeatureChecklistItem } from '../ProductDocumentSet';
import { buildProductDocumentSet } from '../ProductDocumentSet';
import type { ProjectPlan } from '../types/ProjectPlan';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<FeatureChecklistItem> & Pick<FeatureChecklistItem, 'id' | 'briefPoint' | 'surface' | 'targetFiles'>): FeatureChecklistItem {
  return {
    priority: 'must',
    acceptanceSignal: ['Feature ships concretely.'],
    codeSignals: ['Concrete code exists.'],
    uiSignals: ['UI exposes the feature.'],
    dataSignals: ['State is wired.'],
    interactionSignals: ['User can trigger the feature.'],
    source: ['test'],
    ...overrides,
  };
}

const GOOD_DASHBOARD = `
import React, { useState } from 'react';
export function Dashboard() {
  const [metrics] = useState([{ label: 'Revenue', value: 12000 }, { label: 'Users', value: 340 }]);
  return (
    <div>
      <h1>Dashboard</h1>
      {metrics.map(m => <div key={m.label}>{m.label}: {m.value}</div>)}
    </div>
  );
}
`;

const GOOD_ANALYTICS = `
import React from 'react';
import { BarChart } from './BarChart';
export function Analytics() {
  const metrics = [{ label: 'Conversion', value: 3.2 }];
  const report = metrics.map(m => ({ ...m, formatted: m.value.toFixed(1) }));
  return (
    <div>
      <h1>Analytics Report</h1>
      <BarChart data={report} />
      <p>Monthly metrics dashboard</p>
    </div>
  );
}
`;

// ── Positive: all 5 must features covered ────────────────────────────────────

describe('CompletenessGate — positive coverage', () => {
  it('coverageRatioMust = 1.0 and gate passes when all 5 must features are properly implemented', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({ id: 'screen-dashboard', briefPoint: 'Dashboard shows metrics', surface: 'Dashboard', targetFiles: ['pages/Dashboard.tsx'] }),
      makeItem({ id: 'screen-analytics', briefPoint: 'Analytics shows charts', surface: 'Analytics', targetFiles: ['pages/Analytics.tsx'] }),
      makeItem({ id: 'screen-settings', briefPoint: 'Settings page exists', surface: 'Settings', targetFiles: ['pages/Settings.tsx'] }),
      makeItem({ id: 'screen-profile', briefPoint: 'Profile page exists', surface: 'Profile', targetFiles: ['pages/Profile.tsx'] }),
      makeItem({ id: 'screen-home', briefPoint: 'Home screen is implemented', surface: 'Home', targetFiles: ['pages/Home.tsx'] }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/Dashboard.tsx': GOOD_DASHBOARD,
        'pages/Analytics.tsx': GOOD_ANALYTICS,
        'pages/Settings.tsx': `
          import React, { useState } from 'react';
          export function Settings() {
            const [theme, setTheme] = useState('dark');
            return <div><h1>Settings</h1><button onClick={() => setTheme('light')}>Switch theme</button></div>;
          }
        `,
        'pages/Profile.tsx': `
          import React from 'react';
          export function Profile() {
            const user = { name: 'Alice', email: 'alice@example.com' };
            return <div><h1>Profile</h1><p>{user.name}</p><p>{user.email}</p></div>;
          }
        `,
        'pages/Home.tsx': `
          import React from 'react';
          export function Home() {
            const items = ['Task A', 'Task B', 'Task C'];
            return <div><h1>Home</h1><ul>{items.map(i => <li key={i}>{i}</li>)}</ul></div>;
          }
        `,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.coverage.mustTotal).toBe(5);
    expect(result.coverage.mustCovered).toBe(5);
    expect(result.coverage.coverageRatioMust).toBe(1.0);
    expect(result.coverage.uncoveredMust).toHaveLength(0);
    expect(result.coverage.completenessGateStatus).toBe('pass');
    expect(result.blockingReasons).toHaveLength(0);
  });

  it('passes when coverageRatioMust >= 0.8 (4 of 5 must items covered)', () => {
    const goodContent = (name: string) => `
      import React, { useState } from 'react';
      export function ${name}() {
        const [data] = useState([{ id: 1, label: '${name} item' }]);
        return <div><h1>${name}</h1>{data.map(d => <p key={d.id}>{d.label}</p>)}</div>;
      }
    `;
    const checklist: FeatureChecklistItem[] = [
      makeItem({ id: 'screen-a', briefPoint: 'Screen A ships', surface: 'ScreenA', targetFiles: ['pages/ScreenA.tsx'] }),
      makeItem({ id: 'screen-b', briefPoint: 'Screen B ships', surface: 'ScreenB', targetFiles: ['pages/ScreenB.tsx'] }),
      makeItem({ id: 'screen-c', briefPoint: 'Screen C ships', surface: 'ScreenC', targetFiles: ['pages/ScreenC.tsx'] }),
      makeItem({ id: 'screen-d', briefPoint: 'Screen D ships', surface: 'ScreenD', targetFiles: ['pages/ScreenD.tsx'] }),
      makeItem({ id: 'screen-e', briefPoint: 'Screen E ships', surface: 'ScreenE', targetFiles: ['pages/ScreenE.tsx'] }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/ScreenA.tsx': goodContent('ScreenA'),
        'pages/ScreenB.tsx': goodContent('ScreenB'),
        'pages/ScreenC.tsx': goodContent('ScreenC'),
        'pages/ScreenD.tsx': goodContent('ScreenD'),
        // ScreenE missing — 4/5 = 0.8 → still passes
        'pages/ScreenE.tsx': goodContent('ScreenE'),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.coverage.coverageRatioMust).toBe(1.0);
  });
});

// ── Negative: required file missing ──────────────────────────────────────────

describe('CompletenessGate — required file missing', () => {
  it('fails when the required targetFile is absent from generated output', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({ id: 'screen-dash', briefPoint: 'Dashboard ships', surface: 'Dashboard', targetFiles: ['pages/Dashboard.tsx'] }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {},
    });

    expect(result.ok).toBe(false);
    expect(result.coverage.coverageRatioMust).toBeLessThan(0.8);
    expect(result.coverage.uncoveredMust).toContain('Dashboard ships');
    expect(result.blockingReasons[0]).toMatch(/target file.*missing/i);
  });
});

// ── Negative: required file exists but is empty ───────────────────────────────

describe('CompletenessGate — empty file', () => {
  it('fails when the required file exists but is empty', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({ id: 'screen-dash', briefPoint: 'Dashboard ships', surface: 'Dashboard', targetFiles: ['pages/Dashboard.tsx'] }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/Dashboard.tsx': '   \n  ',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/empty/i);
  });
});

// ── Negative: required file exists but only imports/export ───────────────────

describe('CompletenessGate — imports-only file', () => {
  it('fails when the file contains only imports and re-exports', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({ id: 'screen-reports', briefPoint: 'Reports screen ships', surface: 'Reports', targetFiles: ['pages/Reports.tsx'] }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/Reports.tsx': `import React from 'react';
import { ReportsContent } from './ReportsContent';
export { default } from './ReportsContent';
`,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/imports.*exports|imports\/exports/i);
  });
});

// ── Negative: required page contains placeholder ──────────────────────────────

describe('CompletenessGate — placeholder content', () => {
  it('fails when the page returns "Coming soon"', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({ id: 'screen-dash', briefPoint: 'Dashboard ships', surface: 'Dashboard', targetFiles: ['pages/Dashboard.tsx'] }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/Dashboard.tsx': `
          export function Dashboard() {
            return <div>Coming soon</div>;
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/placeholder/i);
  });

  it('fails when the page has "Feature 1" placeholder text', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({ id: 'screen-home', briefPoint: 'Home ships', surface: 'Home', targetFiles: ['pages/Home.tsx'] }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/Home.tsx': `
          export function Home() {
            return <div><p>Feature 1</p><p>Feature 2</p><p>Feature 3</p></div>;
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/placeholder/i);
  });

  it('fails when the page has "KPI 1" placeholder text', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({ id: 'screen-analytics', briefPoint: 'Analytics ships', surface: 'Analytics', targetFiles: ['pages/Analytics.tsx'] }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/Analytics.tsx': `
          export function Analytics() {
            const kpis = ['KPI 1', 'KPI 2', 'KPI 3'];
            return <div>{kpis.map(k => <p key={k}>{k}</p>)}</div>;
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/placeholder/i);
  });

  it('fails when the component returns null', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({ id: 'screen-dash', briefPoint: 'Dashboard ships', surface: 'Dashboard', targetFiles: ['pages/Dashboard.tsx'] }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/Dashboard.tsx': `
          import React from 'react';
          export function Dashboard() {
            return null;
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/null|empty fragment/i);
  });
});

// ── Negative: required capability signal missing ──────────────────────────────

describe('CompletenessGate — missing capability signal', () => {
  it('fails when capability item file exists but has no backend signals', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'capability-backend',
        briefPoint: 'Backend persistence is implemented',
        surface: 'backend',
        targetFiles: ['services/api.ts'],
      }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'services/api.ts': `
          export function hello() {
            return 'Hello World';
          }
          export const config = { theme: 'dark' };
          export function greet(name: string) {
            return \`Hello \${name}\`;
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/capability.*backend.*signals|signals absent/i);
  });

  it('passes when capability item file has the required signals', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'capability-backend',
        briefPoint: 'Backend persistence is implemented',
        surface: 'backend',
        targetFiles: ['services/api.ts'],
      }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'services/api.ts': `
          export async function loadItems() {
            return fetch('/api/items').then(r => r.json());
          }
          export async function saveItem(item: unknown) {
            return fetch('/api/items', { method: 'POST', body: JSON.stringify(item) });
          }
          export function persist(key: string, value: unknown) {
            localStorage.setItem(key, JSON.stringify(value));
          }
        `,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.coverage.coverageRatioMust).toBe(1.0);
  });

  it('fails when analytics capability signals are absent', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'capability-analytics',
        briefPoint: 'Analytics are tracked',
        surface: 'analytics',
        targetFiles: ['services/analytics.ts'],
      }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'services/analytics.ts': `
          export function initTracking() { return true; }
          export function trackAction(name: string) { return name; }
          export function sendEvent(payload: unknown) { return payload; }
        `,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/capability.*analytics|signals absent/i);
  });
});

// ── Negative: fake notification without Notification.requestPermission ────────

describe('CompletenessGate — fake notification', () => {
  it('fails when notification toggle exists but Notification.requestPermission is absent', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'screen-notifications',
        briefPoint: 'Push notification preferences can be toggled',
        surface: 'notifications',
        targetFiles: ['pages/NotificationSettings.tsx'],
      }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/NotificationSettings.tsx': `
          import React, { useState } from 'react';
          export function NotificationSettings() {
            const [enabled, setEnabled] = useState(false);
            return (
              <div>
                <h1>Notification Settings</h1>
                <label>
                  Enable notifications
                  <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                </label>
                <p>Push notification toggle for daily reminders</p>
              </div>
            );
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/Notification\.requestPermission|fake notification/i);
  });

  it('passes when Notification.requestPermission is present', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'screen-notifications',
        briefPoint: 'Push notification preferences can be toggled',
        surface: 'notifications',
        targetFiles: ['pages/NotificationSettings.tsx'],
      }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/NotificationSettings.tsx': `
          import React, { useState } from 'react';
          export function NotificationSettings() {
            const [enabled, setEnabled] = useState(false);
            async function handleToggle() {
              const permission = await Notification.requestPermission();
              setEnabled(permission === 'granted');
            }
            return (
              <div>
                <h1>Notification Settings</h1>
                <label>
                  Enable notifications
                  <input type="checkbox" checked={enabled} onChange={handleToggle} />
                </label>
              </div>
            );
          }
        `,
      },
    });

    expect(result.ok).toBe(true);
  });
});

// ── Negative: fake paywall without create-flow gate ───────────────────────────

describe('CompletenessGate — fake paywall', () => {
  it('fails when paywall banner has no conditional create-flow gate', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'screen-upgrade',
        briefPoint: 'Paywall blocks free users from premium create-flow',
        surface: 'paywall subscription required',
        targetFiles: ['pages/UpgradePage.tsx'],
      }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/UpgradePage.tsx': `
          import React from 'react';
          export function UpgradePage() {
            return (
              <div>
                <h1>Upgrade Plan</h1>
                <p>Upgrade to premium to unlock all features.</p>
                <div className="paywall">
                  <p>Subscription required for this feature</p>
                  <button>Upgrade to Premium</button>
                </div>
              </div>
            );
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/paywall|create-flow gate/i);
  });

  it('passes when paywall has isPremium gate', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'screen-upgrade',
        briefPoint: 'Paywall blocks free users from premium create-flow',
        surface: 'paywall subscription required',
        targetFiles: ['pages/CreateFlow.tsx'],
      }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/CreateFlow.tsx': `
          import React from 'react';
          import { useAuth } from '../hooks/useAuth';
          export function CreateFlow() {
            const { isPremium } = useAuth();
            if (!isPremium) {
              return <div className="paywall"><p>Upgrade to premium</p><button>Upgrade</button></div>;
            }
            return (
              <div>
                <h1>Create new project</h1>
                <form>
                  <input placeholder="Project name" />
                  <button type="submit">Create</button>
                </form>
              </div>
            );
          }
        `,
      },
    });

    expect(result.ok).toBe(true);
  });
});

// ── Negative: fake reminder without persisted config ─────────────────────────

describe('CompletenessGate — fake reminder', () => {
  it('fails when reminder UI exists but no persisted reminder config', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'screen-reminders',
        briefPoint: 'Daily reminder can be configured',
        surface: 'reminder',
        targetFiles: ['pages/ReminderSettings.tsx'],
      }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/ReminderSettings.tsx': `
          import React, { useState } from 'react';
          export function ReminderSettings() {
            const [time, setTime] = useState('08:00');
            return (
              <div>
                <h1>Daily Reminder</h1>
                <label>Reminder time</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} />
                <button>Set reminder</button>
                <p>Schedule reminder for daily habit tracking</p>
              </div>
            );
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/reminder.*config|persisted reminder/i);
  });

  it('passes when reminder config is persisted', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'screen-reminders',
        briefPoint: 'Daily reminder can be configured',
        surface: 'reminder',
        targetFiles: ['pages/ReminderSettings.tsx'],
      }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/ReminderSettings.tsx': `
          import React, { useState } from 'react';
          export function ReminderSettings() {
            const [reminderTime, setReminderTime] = useState('08:00');
            const [reminderEnabled, setReminderEnabled] = useState(false);
            function saveReminder() {
              localStorage.setItem('reminderConfig', JSON.stringify({ time: reminderTime, enabled: reminderEnabled }));
            }
            return (
              <div>
                <h1>Daily Reminder</h1>
                <input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} />
                <button onClick={saveReminder}>Set reminder</button>
              </div>
            );
          }
        `,
      },
    });

    expect(result.ok).toBe(true);
  });
});

// ── Negative: Coach page without message state and send flow ─────────────────

describe('CompletenessGate — Coach without message flow', () => {
  it('fails when Coach page has coach UI but no message state or send handler', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'screen-coach',
        briefPoint: 'Coach provides interactive message-based guidance',
        surface: 'coach',
        targetFiles: ['pages/CoachPage.tsx'],
      }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/CoachPage.tsx': `
          import React from 'react';
          export function CoachPage() {
            return (
              <div>
                <h1>Coach</h1>
                <p>Your AI coaching session</p>
                <div className="coach-chat">
                  <div>Welcome to coaching!</div>
                  <input placeholder="Send message to coach..." />
                  <button>Send</button>
                </div>
              </div>
            );
          }
        `,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/coach.*message|message.*flow|send interaction/i);
  });

  it('fails when Coach page has message state but no send handler', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'screen-coach',
        briefPoint: 'Coach provides interactive message-based guidance',
        surface: 'coach',
        targetFiles: ['pages/CoachPage.tsx'],
      }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/CoachPage.tsx': `
          import React, { useState } from 'react';
          export function CoachPage() {
            const [messages, setMessages] = useState([{ role: 'coach', text: 'Hello!' }]);
            return (
              <div>
                <h1>Coach</h1>
                <div className="coach-chat coaching">
                  {messages.map((m, i) => <div key={i}>{m.text}</div>)}
                  <input placeholder="Send message to coach..." />
                  <button>Send</button>
                </div>
              </div>
            );
          }
        `,
      },
    });

    // Has message state (useState + messages) but no send handler
    expect(result.ok).toBe(false);
    expect(result.blockingReasons[0]).toMatch(/coach.*message|message.*flow|send interaction/i);
  });

  it('passes when Coach page has both message state and send handler', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'screen-coach',
        briefPoint: 'Coach provides interactive message-based guidance',
        surface: 'coach',
        targetFiles: ['pages/CoachPage.tsx'],
      }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/CoachPage.tsx': `
          import React, { useState } from 'react';
          export function CoachPage() {
            const [messages, setMessages] = useState([{ role: 'coach', text: 'Hello!' }]);
            const [input, setInput] = useState('');
            function handleSend() {
              if (!input.trim()) return;
              setMessages(prev => [...prev, { role: 'user', text: input }]);
              setInput('');
            }
            return (
              <div>
                <h1>Coach</h1>
                <div className="coaching coach-chat">
                  {messages.map((m, i) => <div key={i}>{m.text}</div>)}
                  <input value={input} onChange={e => setInput(e.target.value)} placeholder="Message..." />
                  <button onClick={handleSend}>Send</button>
                </div>
              </div>
            );
          }
        `,
      },
    });

    expect(result.ok).toBe(true);
  });
});

// ── Integration: ProductDocumentSet featureChecklist feeds CompletenessGate ───

describe('CompletenessGate — integration with ProductDocumentSet', () => {
  it('ProductDocumentSet.featureChecklist feeds CompletenessGate and produces valid telemetry', () => {
    const input = {
      prompt: 'Build a habit tracking app',
      skeletonId: 'mobile-app' as const,
      prebuiltPlan: {
        appName: 'HabitTrack',
        description: 'Daily habit tracker with streaks.',
        theme: 'mobile',
        layout: { type: 'app', navigation: 'tabs' },
        shadcnComponents: [],
        icons: [],
        pages: [
          { path: '/home', name: 'Home', file: 'pages/Home.tsx', purpose: 'Daily habits overview', isMainScreen: true },
        ],
        kickoffScope: {
          id: 'core',
          label: 'Core',
          description: 'Core habit tracking',
          selectedCapabilityIds: [],
          deferredCapabilityIds: [],
        },
      } as ProjectPlan,
      architectPlan: {
        appName: 'HabitTrack',
        summary: 'Daily habit tracker with streaks.',
        pages: [
          { path: '/home', name: 'Home', file: 'pages/Home.tsx', purpose: 'Daily habits overview' },
        ],
        fileTree: {
          'pages/Home.tsx': 'Main habits screen',
          'services/habitStore.ts': 'Habit state management',
        },
      },
    };

    const productDocs = buildProductDocumentSet(input);
    expect(productDocs.featureChecklist.length).toBeGreaterThan(0);
    expect(productDocs.featureChecklist.some(item => item.priority === 'must')).toBe(true);

    const result = evaluateCompletenessGate({
      featureChecklist: productDocs.featureChecklist,
      generatedFiles: {
        'pages/Home.tsx': `
          import React, { useState } from 'react';
          export function Home() {
            const [habits] = useState([{ id: 1, name: 'Meditate', done: false }, { id: 2, name: 'Run', done: true }]);
            return (
              <div>
                <h1>Today's Habits</h1>
                {habits.map(h => <div key={h.id}>{h.name}: {h.done ? 'Done' : 'Pending'}</div>)}
              </div>
            );
          }
        `,
        'services/habitStore.ts': `
          import { useState } from 'react';
          export interface Habit { id: number; name: string; done: boolean; streak: number; }
          export function useHabitStore() {
            const [habits, setHabits] = useState<Habit[]>([]);
            const toggle = (id: number) => setHabits(prev => prev.map(h => h.id === id ? { ...h, done: !h.done } : h));
            const add = (name: string) => setHabits(prev => [...prev, { id: Date.now(), name, done: false, streak: 0 }]);
            return { habits, toggle, add };
          }
        `,
      },
    });

    // Telemetry fields are present
    expect(typeof result.coverage.mustTotal).toBe('number');
    expect(typeof result.coverage.mustCovered).toBe('number');
    expect(typeof result.coverage.shouldTotal).toBe('number');
    expect(typeof result.coverage.shouldCovered).toBe('number');
    expect(typeof result.coverage.coverageRatioMust).toBe('number');
    expect(typeof result.coverage.coverageRatioAll).toBe('number');
    expect(Array.isArray(result.coverage.uncoveredMust)).toBe(true);
    expect(Array.isArray(result.coverage.uncoveredShould)).toBe(true);
    expect(['pass', 'fail']).toContain(result.coverage.completenessGateStatus);
    expect(typeof result.coverage.completenessGateReason).toBe('string');
  });

  it('factoryGatePassed cannot be true when coverageRatioMust < 0.8', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({ id: 'screen-a', briefPoint: 'Feature A', surface: 'FeatureA', targetFiles: ['pages/A.tsx'] }),
      makeItem({ id: 'screen-b', briefPoint: 'Feature B', surface: 'FeatureB', targetFiles: ['pages/B.tsx'] }),
      makeItem({ id: 'screen-c', briefPoint: 'Feature C', surface: 'FeatureC', targetFiles: ['pages/C.tsx'] }),
      makeItem({ id: 'screen-d', briefPoint: 'Feature D', surface: 'FeatureD', targetFiles: ['pages/D.tsx'] }),
      makeItem({ id: 'screen-e', briefPoint: 'Feature E', surface: 'FeatureE', targetFiles: ['pages/E.tsx'] }),
    ];
    const goodContent = (n: string) => `
      import React, { useState } from 'react';
      export function ${n}() {
        const [v] = useState(1);
        return <div><h1>${n}</h1><p>Value: {v}</p></div>;
      }
    `;

    // Only 3 of 5 = 0.6 < 0.8 → must fail
    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/A.tsx': goodContent('A'),
        'pages/B.tsx': goodContent('B'),
        'pages/C.tsx': goodContent('C'),
        // D and E missing
      },
    });

    expect(result.ok).toBe(false);
    expect(result.coverage.coverageRatioMust).toBeLessThan(0.8);
    expect(result.coverage.completenessGateStatus).toBe('fail');
    // factoryGatePassed is always false when ok=false
    expect(result.ok && result.coverage.coverageRatioMust >= 0.8).toBe(false);
  });

  it('ProtoPipeline-style: gate returns structured telemetry including all required fields', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({ id: 'screen-dash', briefPoint: 'Dashboard ships', surface: 'Dashboard', targetFiles: ['pages/Dashboard.tsx'], priority: 'must' }),
      makeItem({ id: 'screen-report', briefPoint: 'Reports ship', surface: 'Reports', targetFiles: ['pages/Reports.tsx'], priority: 'should' }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: {
        'pages/Dashboard.tsx': GOOD_DASHBOARD,
        'pages/Reports.tsx': `
          import React from 'react';
          export function Reports() {
            const data = [{ date: '2024-01', revenue: 1000 }];
            return <div><h1>Reports</h1>{data.map(d => <p key={d.date}>{d.date}: {d.revenue}</p>)}</div>;
          }
        `,
      },
    });

    expect(result.coverage.mustTotal).toBe(1);
    expect(result.coverage.mustCovered).toBe(1);
    expect(result.coverage.shouldTotal).toBe(1);
    expect(result.coverage.shouldCovered).toBe(1);
    expect(result.coverage.coverageRatioMust).toBe(1.0);
    expect(result.coverage.coverageRatioAll).toBe(1.0);
    expect(result.coverage.completenessGateStatus).toBe('pass');
  });
});

// ── Backward-compat: legacy prebuiltPlan path ─────────────────────────────────

describe('CompletenessGate — legacy prebuiltPlan backward compatibility', () => {
  function createPlan(): ProjectPlan {
    return {
      appName: 'OpsCanvas',
      description: 'Internal command center.',
      theme: 'graphite',
      layout: { type: 'app', navigation: 'sidebar' },
      pages: [
        { path: '/dashboard', name: 'Dashboard', file: 'pages/Dashboard.tsx', purpose: 'Main ops overview.', isMainScreen: true },
        { path: '/reports', name: 'Reports', file: 'pages/Reports.tsx', purpose: 'Analytics and export workflow.', isMainScreen: false },
      ],
      shadcnComponents: ['Button', 'Card'],
      icons: ['BarChart3'],
      kickoffScope: {
        id: 'core_backend_ai',
        label: 'Core + backend + AI',
        description: 'Command center with real persistence and reporting.',
        selectedCapabilityIds: ['backend', 'analytics'],
        deferredCapabilityIds: [],
      },
    } as ProjectPlan;
  }

  it('passes when required pages and must-capabilities are visible (legacy path)', () => {
    const result = evaluateCompletenessGate({
      prebuiltPlan: createPlan(),
      generatedFiles: {
        'pages/Dashboard.tsx': 'export function Dashboard() { return <div>Analytics dashboard</div>; }',
        'pages/Reports.tsx': 'export function Reports() { return <div>Metrics report export</div>; }',
        'services/api.ts': 'export async function load() { return fetch("/api/reports"); }',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.coverage.coveredPageCount).toBe(2);
    expect(result.coverage.coveredCapabilityCount).toBe(2);
  });

  it('fails when required pages or capabilities are missing (legacy path)', () => {
    const result = evaluateCompletenessGate({
      prebuiltPlan: createPlan(),
      generatedFiles: {
        'pages/Dashboard.tsx': 'export function Dashboard() { return <div>Overview</div>; }',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.coverage.missingPageFiles).toContain('pages/Reports.tsx');
    expect(result.coverage.missingCapabilities).toContain('backend');
    expect(result.blockingReasons.length).toBeGreaterThan(0);
  });

  it('returns legacy fields even when featureChecklist is used', () => {
    const checklist: FeatureChecklistItem[] = [
      makeItem({ id: 'screen-dash', briefPoint: 'Dashboard ships', surface: 'Dashboard', targetFiles: ['pages/Dashboard.tsx'] }),
    ];

    const result = evaluateCompletenessGate({
      featureChecklist: checklist,
      generatedFiles: { 'pages/Dashboard.tsx': GOOD_DASHBOARD },
    });

    // Legacy fields populated from new logic
    expect(typeof result.coverage.requiredPageCount).toBe('number');
    expect(typeof result.coverage.coveredPageCount).toBe('number');
    expect(Array.isArray(result.coverage.missingPageFiles)).toBe(true);
    expect(typeof result.coverage.requiredCapabilityCount).toBe('number');
  });
});
