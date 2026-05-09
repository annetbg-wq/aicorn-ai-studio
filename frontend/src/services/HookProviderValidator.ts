/**
 * HookProviderValidator.ts — Pre-compile custom hook/provider completeness check.
 *
 * Common gap: AI often generates custom hooks (useApp, useCartContext, useAuth)
 * with corresponding Provider components, but forgets to:
 *   a) Create the Provider
 *   b) Import the Provider into App.tsx / main.tsx
 *   c) Wrap the root with the Provider
 *
 * This results in a "Cannot read properties of undefined" or
 * "useXxx must be used within XxxProvider" runtime crash that Vite won't catch.
 *
 * Runs POST-parse, PRE-materialize (same slot as PropWiringValidator).
 */

export interface HookDefinition {
  /** Normalized file path where the hook is defined, e.g. 'contexts/AppContext.tsx' */
  file: string;
  /** Hook name, e.g. 'useApp' */
  hookName: string;
  /** Provider name expected to wrap consumers, e.g. 'AppProvider' */
  expectedProvider: string;
}

export interface HookUsage {
  /** File where the hook is used */
  file: string;
  /** Hook name called */
  hookName: string;
}

export interface HookProviderIssue {
  hookName: string;
  expectedProvider: string;
  definedIn: string;
  /** Files that call the hook */
  usedIn: string[];
  /** Whether a Provider component was found anywhere in llmFiles */
  providerExists: boolean;
  /** Whether the Provider is imported in App.tsx */
  providerImportedInApp: boolean;
  /** Whether the Provider appears to wrap content in App.tsx */
  providerUsedInApp: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derive the expected Provider name from a hook name.
 * useApp → AppProvider, useAuthContext → AuthContextProvider, etc.
 */
function deriveProviderName(hookName: string): string {
  // Strip leading 'use'
  const body = hookName.replace(/^use/, '');
  // Strip trailing 'Context' / 'Hook' if present, then re-append 'Provider'
  const stripped = body.replace(/Context$/, '').replace(/Hook$/, '');
  return stripped + 'Provider';
}

/**
 * Extract all custom hook definitions from a file.
 * Looks for:
 *   export function useXxx(...)
 *   export const useXxx = (...)
 *
 * AND checks whether the hook throws / returns context (indicating it
 * must be used inside a provider):
 *   const ctx = useContext(XxxContext)
 *   if (!ctx) throw new Error('useXxx must be used within ...')
 */
export function extractHookDefinitions(content: string, filePath: string): HookDefinition[] {
  const defs: HookDefinition[] = [];
  // Match exported hooks
  const hookDefRe = /export\s+(?:function|const)\s+(use[A-Z][A-Za-z0-9]*)/g;
  let m: RegExpExecArray | null;
  while ((m = hookDefRe.exec(content)) !== null) {
    const hookName = m[1];
    // Only flag hooks that use useContext internally — these require a Provider
    const contextUsageRe = new RegExp(`useContext\\s*\\(\\s*[A-Za-z0-9_]*Context`, 'g');
    const throwsIfMissing = /throw\s+new\s+Error.*must\s+be\s+used\s+within/i.test(content);
    const usesContext = contextUsageRe.test(content);
    if (usesContext || throwsIfMissing) {
      defs.push({
        file: filePath,
        hookName,
        expectedProvider: deriveProviderName(hookName),
      });
    }
  }
  return defs;
}

/**
 * Extract all custom hook call-sites from a file.
 * Only counts hooks that start with 'use' and are PascalCase-second-char (custom hooks).
 */
export function extractHookUsages(content: string, filePath: string): HookUsage[] {
  const usages: HookUsage[] = [];
  // Match: = useXxx( or { ... } = useXxx( or useXxx() inline
  const hookCallRe = /\b(use[A-Z][A-Za-z0-9]*)\s*\(/g;
  // Standard React hooks to exclude
  const builtins = new Set([
    'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef',
    'useContext', 'useReducer', 'useLayoutEffect', 'useImperativeHandle',
    'useDebugValue', 'useId', 'useDeferredValue', 'useTransition',
    'useSyncExternalStore', 'useInsertionEffect',
  ]);
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = hookCallRe.exec(content)) !== null) {
    const hookName = m[1];
    if (builtins.has(hookName) || seen.has(hookName)) continue;

    // Skip function/const definitions: "function useXxx(" or "const useXxx ="
    const prefix = content.slice(Math.max(0, m.index - 12), m.index);
    if (/\bfunction\s+$/.test(prefix) || /\bconst\s+$/.test(prefix)) continue;

    seen.add(hookName);
    usages.push({ file: filePath, hookName });
  }
  return usages;
}

/**
 * Check whether a Provider component is imported and used in App.tsx.
 */
function checkProviderInApp(providerName: string, appContent: string): {
  imported: boolean;
  used: boolean;
} {
  const importRe = new RegExp(`import[^;]*\\b${providerName}\\b[^;]*from`);
  const jsxRe = new RegExp(`<\\s*${providerName}[\\s/>]`);
  return {
    imported: importRe.test(appContent),
    used: jsxRe.test(appContent),
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Validate that every custom context hook used across llmFiles has a corresponding
 * Provider that is correctly imported and wrapping content in App.tsx.
 *
 * @param llmFiles  Record<string, string> — normalized paths → file contents
 * @returns         Array of issues found (empty = all good)
 */
export function validateHookProviders(llmFiles: Record<string, string>): HookProviderIssue[] {
  // Normalize: strip leading / and src/ for consistent lookup
  const normalize = (p: string) => p.replace(/^\/+/, '').replace(/^src\//, '');

  const entries = Object.entries(llmFiles).map(([k, v]) => [normalize(k), v] as [string, string]);
  const fileMap = new Map(entries);

  // Find App.tsx content
  const appContent =
    fileMap.get('App.tsx') ??
    fileMap.get('app.tsx') ??
    '';

  // Step 1: Collect all hook definitions across all files
  const allDefs: HookDefinition[] = [];
  for (const [path, content] of fileMap) {
    const defs = extractHookDefinitions(content, path);
    allDefs.push(...defs);
  }

  if (allDefs.length === 0) return [];

  // Step 2: Collect all hook usages (call-sites) across all files
  const usagesByHook = new Map<string, string[]>(); // hookName → files where used
  for (const [path, content] of fileMap) {
    const usages = extractHookUsages(content, path);
    for (const u of usages) {
      const existing = usagesByHook.get(u.hookName) ?? [];
      if (!existing.includes(path)) existing.push(path);
      usagesByHook.set(u.hookName, existing);
    }
  }

  // Step 3: For each hook definition that is actually USED, check Provider completeness
  const issues: HookProviderIssue[] = [];

  for (const def of allDefs) {
    const usedIn = usagesByHook.get(def.hookName) ?? [];

    // Skip hooks that are defined but never called (no runtime impact)
    if (usedIn.length === 0) continue;

    // Check if any file defines the Provider component
    const providerRe = new RegExp(
      `(?:export\\s+(?:default\\s+)?(?:function|const)\\s+|export\\s+\\{[^}]*\\b)${def.expectedProvider}\\b`,
    );
    let providerExists = false;
    for (const [, content] of fileMap) {
      if (providerRe.test(content)) { providerExists = true; break; }
    }

    // Check App.tsx for Provider import + usage
    const { imported: providerImportedInApp, used: providerUsedInApp } =
      checkProviderInApp(def.expectedProvider, appContent);

    // Issue if: Provider missing OR not imported in App OR not used in App
    const hasIssue = !providerExists || !providerImportedInApp || !providerUsedInApp;
    if (hasIssue) {
      issues.push({
        hookName: def.hookName,
        expectedProvider: def.expectedProvider,
        definedIn: def.file,
        usedIn,
        providerExists,
        providerImportedInApp,
        providerUsedInApp,
      });
    }
  }

  return issues;
}

/**
 * Format issues for onLog output.
 */
export function formatHookProviderIssues(issues: HookProviderIssue[]): string[] {
  return issues.map(i => {
    const parts: string[] = [];
    if (!i.providerExists) parts.push(`${i.expectedProvider} NOT FOUND in any file`);
    else if (!i.providerImportedInApp) parts.push(`${i.expectedProvider} not imported in App.tsx`);
    else if (!i.providerUsedInApp) parts.push(`${i.expectedProvider} imported but not used in App.tsx JSX`);
    return `[HookProvider] ${i.hookName} (${i.definedIn}) — ${parts.join('; ')} — used in: ${i.usedIn.join(', ')}`;
  });
}

/**
 * Build a fix prompt for hook/provider completeness issues.
 */
export function buildHookProviderFixPrompt(
  issues: HookProviderIssue[],
  llmFiles: Record<string, string>,
): string {
  const normalize = (p: string) => p.replace(/^\/+/, '').replace(/^src\//, '');
  const fileMap = new Map(
    Object.entries(llmFiles).map(([k, v]) => [normalize(k), v] as [string, string]),
  );
  const appContent = fileMap.get('App.tsx') ?? fileMap.get('app.tsx') ?? '';

  const issueBlocks = issues.map(i => {
    const hookFileContent = fileMap.get(i.definedIn)?.slice(0, 1500) ?? '(not found)';
    return `
HOOK: ${i.hookName}
Defined in: ${i.definedIn}
Expected provider: ${i.expectedProvider}
Used in: ${i.usedIn.join(', ')}
Issues:${!i.providerExists ? `\n  • ${i.expectedProvider} component does not exist in any file` : ''}${!i.providerImportedInApp ? `\n  • ${i.expectedProvider} is not imported in App.tsx` : ''}${!i.providerUsedInApp ? `\n  • ${i.expectedProvider} is not wrapping app content in App.tsx JSX` : ''}

Hook source (${i.definedIn}):
\`\`\`tsx
${hookFileContent}
\`\`\``;
  }).join('\n---\n');

  return `The React app has custom hooks that require Provider wrappers, but the Providers are missing or not wired in App.tsx. This causes runtime errors like "useXxx must be used within XxxProvider".

${issueBlocks}

CURRENT App.tsx:
\`\`\`tsx
${appContent.slice(0, 2000)}
\`\`\`

Fix all issues:
1. If a Provider component is missing, create it (export a React component that wraps children with the context value).
2. Import every missing Provider into App.tsx.
3. Wrap the app root (or Router content) with every Provider — in the correct nesting order.
4. Do NOT remove any existing functionality.

Return the COMPLETE fixed files as a JSON artifact. Include every file that needs to change:
\`\`\`json
{"artifact":{"files":[{"path":"App.tsx","content":"..."},{"path":"contexts/AppContext.tsx","content":"..."}]}}
\`\`\`
Output ONLY the JSON.`;
}
