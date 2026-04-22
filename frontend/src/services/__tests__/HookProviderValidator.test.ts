import { describe, it, expect } from 'vitest';
import {
  extractHookDefinitions,
  extractHookUsages,
  validateHookProviders,
  formatHookProviderIssues,
  buildHookProviderFixPrompt,
} from '../HookProviderValidator';

// ── extractHookDefinitions ──────────────────────────────────────────────────

describe('extractHookDefinitions', () => {
  it('detects hook that uses useContext internally', () => {
    const content = `
import { useContext } from 'react';
import { AppContext } from './AppContext';

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}`;
    const defs = extractHookDefinitions(content, 'contexts/AppContext.tsx');
    expect(defs).toHaveLength(1);
    expect(defs[0].hookName).toBe('useApp');
    expect(defs[0].expectedProvider).toBe('AppProvider');
    expect(defs[0].file).toBe('contexts/AppContext.tsx');
  });

  it('ignores hooks that do NOT use useContext (not provider-dependent)', () => {
    const content = `
export function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => { /* ... */ }, [value, delay]);
  return debouncedValue;
}`;
    const defs = extractHookDefinitions(content, 'hooks/useDebounce.ts');
    expect(defs).toHaveLength(0);
  });

  it('detects hook that throws if missing context', () => {
    const content = `
export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};`;
    const defs = extractHookDefinitions(content, 'contexts/CartContext.tsx');
    expect(defs[0].hookName).toBe('useCart');
    expect(defs[0].expectedProvider).toBe('CartProvider');
  });

  it('strips Context suffix when deriving provider name', () => {
    const content = `
export function useAuthContext() {
  const ctx = useContext(AuthContext);
  return ctx;
}`;
    const defs = extractHookDefinitions(content, 'contexts/AuthContext.tsx');
    expect(defs[0].expectedProvider).toBe('AuthProvider');
  });
});

// ── extractHookUsages ───────────────────────────────────────────────────────

describe('extractHookUsages', () => {
  it('detects custom hook calls and ignores React built-ins', () => {
    const content = `
import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { useCart } from '../contexts/CartContext';

function Dashboard() {
  const [items, setItems] = useState([]);
  useEffect(() => {}, []);
  const { user } = useApp();
  const { cart } = useCart();
  return <div />;
}`;
    const usages = extractHookUsages(content, 'pages/Dashboard.tsx');
    const names = usages.map(u => u.hookName);
    expect(names).toContain('useApp');
    expect(names).toContain('useCart');
    expect(names).not.toContain('useState');
    expect(names).not.toContain('useEffect');
  });

  it('does not duplicate same hook called multiple times', () => {
    const content = `
function A() { const x = useApp(); return <div />; }
function B() { const y = useApp(); return <div />; }`;
    const usages = extractHookUsages(content, 'App.tsx');
    expect(usages.filter(u => u.hookName === 'useApp')).toHaveLength(1);
  });
});

// ── validateHookProviders ───────────────────────────────────────────────────

describe('validateHookProviders', () => {
  it('returns no issues when Provider is defined, imported, and used in App.tsx', () => {
    const llmFiles: Record<string, string> = {
      '/App.tsx': `
import { AppProvider } from './contexts/AppContext';
import Dashboard from './pages/Dashboard';
export default function App() {
  return <AppProvider><Dashboard /></AppProvider>;
}`,
      '/contexts/AppContext.tsx': `
import { createContext, useContext, useState } from 'react';
const AppContext = createContext(null);
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  return <AppContext.Provider value={{ user, setUser }}>{children}</AppContext.Provider>;
}`,
      '/pages/Dashboard.tsx': `
import { useApp } from '../contexts/AppContext';
export default function Dashboard() {
  const { user } = useApp();
  return <div>{user?.name}</div>;
}`,
    };
    const issues = validateHookProviders(llmFiles);
    expect(issues).toHaveLength(0);
  });

  it('detects missing Provider in any file', () => {
    const llmFiles: Record<string, string> = {
      '/App.tsx': `
import Dashboard from './pages/Dashboard';
export default function App() { return <Dashboard />; }`,
      '/contexts/AppContext.tsx': `
import { useContext } from 'react';
const AppContext = null;
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}`,
      '/pages/Dashboard.tsx': `
import { useApp } from '../contexts/AppContext';
export default function Dashboard() {
  const { user } = useApp();
  return <div />;
}`,
    };
    const issues = validateHookProviders(llmFiles);
    expect(issues).toHaveLength(1);
    expect(issues[0].hookName).toBe('useApp');
    expect(issues[0].providerExists).toBe(false);
  });

  it('detects Provider exists but not imported in App.tsx', () => {
    const llmFiles: Record<string, string> = {
      '/App.tsx': `
import Dashboard from './pages/Dashboard';
export default function App() { return <Dashboard />; }`,
      '/contexts/AppContext.tsx': `
import { createContext, useContext } from 'react';
const AppContext = createContext(null);
export function useApp() {
  const ctx = useContext(AppContext);
  return ctx;
}
export function AppProvider({ children }) {
  return <AppContext.Provider value={{}}>{children}</AppContext.Provider>;
}`,
      '/pages/Dashboard.tsx': `
import { useApp } from '../contexts/AppContext';
export default function Dashboard() {
  const x = useApp();
  return <div />;
}`,
    };
    const issues = validateHookProviders(llmFiles);
    expect(issues).toHaveLength(1);
    expect(issues[0].providerExists).toBe(true);
    expect(issues[0].providerImportedInApp).toBe(false);
  });

  it('detects Provider imported but not used in App.tsx JSX', () => {
    const llmFiles: Record<string, string> = {
      '/App.tsx': `
import { AppProvider } from './contexts/AppContext';
import Dashboard from './pages/Dashboard';
export default function App() { return <Dashboard />; }`,
      '/contexts/AppContext.tsx': `
import { createContext, useContext } from 'react';
const AppContext = createContext(null);
export function useApp() {
  const ctx = useContext(AppContext);
  return ctx;
}
export function AppProvider({ children }) {
  return <AppContext.Provider value={{}}>{children}</AppContext.Provider>;
}`,
      '/pages/Dashboard.tsx': `
import { useApp } from '../contexts/AppContext';
export default function Dashboard() {
  const x = useApp();
  return <div />;
}`,
    };
    const issues = validateHookProviders(llmFiles);
    expect(issues).toHaveLength(1);
    expect(issues[0].providerExists).toBe(true);
    expect(issues[0].providerImportedInApp).toBe(true);
    expect(issues[0].providerUsedInApp).toBe(false);
  });

  it('skips hooks that are defined but never called', () => {
    const llmFiles: Record<string, string> = {
      '/App.tsx': `export default function App() { return <div />; }`,
      '/contexts/AppContext.tsx': `
import { useContext } from 'react';
const AppContext = null;
export function useApp() {
  const ctx = useContext(AppContext);
  return ctx;
}`,
    };
    const issues = validateHookProviders(llmFiles);
    // useApp is defined but never called anywhere
    expect(issues).toHaveLength(0);
  });

  it('handles multiple hooks with multiple issues', () => {
    const llmFiles: Record<string, string> = {
      '/App.tsx': `export default function App() { return <div />; }`,
      '/contexts/AppContext.tsx': `
import { useContext } from 'react';
export function useApp() { const ctx = useContext(AppContext); return ctx; }`,
      '/contexts/CartContext.tsx': `
import { useContext } from 'react';
export function useCart() { const ctx = useContext(CartContext); return ctx; }`,
      '/pages/Home.tsx': `
import { useApp } from '../contexts/AppContext';
import { useCart } from '../contexts/CartContext';
export default function Home() {
  const app = useApp();
  const cart = useCart();
  return <div />;
}`,
    };
    const issues = validateHookProviders(llmFiles);
    expect(issues.length).toBeGreaterThanOrEqual(2);
    const hookNames = issues.map(i => i.hookName);
    expect(hookNames).toContain('useApp');
    expect(hookNames).toContain('useCart');
  });
});

// ── formatHookProviderIssues + buildHookProviderFixPrompt ───────────────────

describe('formatHookProviderIssues', () => {
  it('formats issues as readable log messages', () => {
    const issues = [{
      hookName: 'useApp',
      expectedProvider: 'AppProvider',
      definedIn: 'contexts/AppContext.tsx',
      usedIn: ['pages/Dashboard.tsx'],
      providerExists: false,
      providerImportedInApp: false,
      providerUsedInApp: false,
    }];
    const lines = formatHookProviderIssues(issues);
    expect(lines[0]).toContain('useApp');
    expect(lines[0]).toContain('AppProvider');
    expect(lines[0]).toContain('NOT FOUND');
  });
});

describe('buildHookProviderFixPrompt', () => {
  it('includes hook name, provider name, and App.tsx content in prompt', () => {
    const llmFiles: Record<string, string> = {
      '/App.tsx': 'export default function App() { return <div />; }',
      '/contexts/AppContext.tsx': `
import { useContext } from 'react';
export function useApp() { const ctx = useContext(AppContext); return ctx; }`,
    };
    const issues = [{
      hookName: 'useApp',
      expectedProvider: 'AppProvider',
      definedIn: 'contexts/AppContext.tsx',
      usedIn: ['pages/Dashboard.tsx'],
      providerExists: false,
      providerImportedInApp: false,
      providerUsedInApp: false,
    }];
    const prompt = buildHookProviderFixPrompt(issues, llmFiles);
    expect(prompt).toContain('useApp');
    expect(prompt).toContain('AppProvider');
    expect(prompt).toContain('App.tsx');
  });
});
