/**
 * PropWiringValidator.ts — Pre-compile prop-wiring correctness check.
 *
 * Lovable-style gap: AI often generates components with required props but
 * renders them in App.tsx without passing those props, causing runtime
 * "Cannot read properties of undefined" errors that Vite won't catch.
 *
 * This validator runs BEFORE compilation, detects mismatches, and returns
 * enough context for the fix prompt to repair App.tsx + component together.
 */

export interface ComponentPropSpec {
  /** Normalized path, e.g. 'pages/Profile.tsx' */
  file: string;
  /** Component name, e.g. 'Profile' */
  name: string;
  /** Required (non-optional) props */
  required: string[];
  /** Optional props (have '?') */
  optional: string[];
}

export interface AppRouteUsage {
  /** Component name used in the route, e.g. 'Profile' */
  componentName: string;
  /** Props explicitly passed in JSX, e.g. ['profile', 'onUpdateProfile'] */
  passedProps: string[];
  /** Raw JSX snippet for context */
  snippet: string;
}

export interface PropWiringIssue {
  componentFile: string;
  componentName: string;
  requiredProps: string[];
  passedProps: string[];
  missingProps: string[];
}

/** Extract exported React component name from file path heuristic. */
function componentNameFromPath(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  return base.replace(/\.(tsx?|jsx?)$/, '');
}

/**
 * Extract required and optional props from a TSX component file.
 * Handles:
 *   interface FooProps { bar: string; baz?: number; }
 *   type FooProps = { bar: string; baz?: number; }
 *   function Foo({ bar, baz }: FooProps)
 *   ({ bar, baz }: { bar: string; baz?: number })
 */
export function extractComponentProps(content: string): { required: string[]; optional: string[] } {
  const required: string[] = [];
  const optional: string[] = [];

  // Strategy 1: Find named interface/type Props block
  // Matches: interface XxxProps { ... } or type XxxProps = { ... }
  const propsBlockRe = /(?:interface|type)\s+\w*[Pp]rops\s*(?:=\s*)?\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  let foundBlock = false;

  while ((m = propsBlockRe.exec(content)) !== null) {
    foundBlock = true;
    const block = m[1];
    // Each line: propName?: type  or  propName: type
    const lineRe = /^\s*(?:readonly\s+)?(\w+)(\??):/gm;
    let lm: RegExpExecArray | null;
    while ((lm = lineRe.exec(block)) !== null) {
      const [, name, optional_marker] = lm;
      if (name === 'children') continue; // skip children - always optional
      if (optional_marker === '?') {
        optional.push(name);
      } else {
        required.push(name);
      }
    }
  }

  if (foundBlock) return { required, optional };

  // Strategy 2: Inline destructured props in function signature
  // function Foo({ bar, baz }: { bar: string; baz?: number })
  const inlineRe = /(?:function\s+\w+|=>\s*\(|export\s+default\s+function\s+\w+)\s*\(\s*\{([^}]+)\}\s*:/;
  const im = inlineRe.exec(content);
  if (im) {
    const destructured = im[1];
    // Just grab the names - we can't easily tell required vs optional here
    const names = destructured.match(/\b(\w+)\b(?=\s*[,}=])/g) ?? [];
    for (const n of names) {
      if (n !== 'children') required.push(n); // conservative: treat all as required
    }
  }

  return { required, optional };
}

/**
 * Extract component usages from App.tsx Routes/JSX.
 * Uses brace-depth tracking to correctly handle nested JSX like:
 *   element={<Chat messages={msgs} isPremium={false} />}
 *
 * A naive `[^>]*?` regex fails because `>` appears inside `/>` of nested elements.
 */
export function extractAppRouteUsages(appContent: string): AppRouteUsage[] {
  const usages: AppRouteUsage[] = [];

  // Find all PascalCase JSX element openings: <ComponentName
  const tagStartRe = /<([A-Z][A-Za-z]+)/g;
  let m: RegExpExecArray | null;

  while ((m = tagStartRe.exec(appContent)) !== null) {
    const componentName = m[1];
    const afterName = m.index + m[0].length;

    // Scan forward collecting the props string, tracking { } depth.
    // Stop at /> or > only when depth === 0 (not inside an attribute value).
    let propsStr = '';
    let depth = 0;
    let i = afterName;
    let found = false;

    while (i < appContent.length) {
      const ch = appContent[i];
      if (ch === '{') {
        depth++;
        propsStr += ch;
      } else if (ch === '}') {
        depth--;
        propsStr += ch;
      } else if (depth === 0 && ch === '/' && appContent[i + 1] === '>') {
        // Self-closing tag at depth 0
        found = true;
        break;
      } else if (depth === 0 && ch === '>') {
        // Opening tag at depth 0
        found = true;
        break;
      } else {
        propsStr += ch;
      }
      i++;
    }

    if (!found) continue;

    // Extract prop names from the captured attribute string
    const passedProps: string[] = [];
    const SKIP_ATTRS = new Set([
      'key', 'ref', 'className', 'style', 'id', 'type', 'role',
      'onClick', 'onChange', 'onSubmit', 'onBlur', 'onFocus',
      'path', 'element', 'index', 'exact', 'name',
    ]);
    const propRe = /\b(\w+)\s*=/g;
    let pm: RegExpExecArray | null;
    while ((pm = propRe.exec(propsStr)) !== null) {
      const attr = pm[1];
      if (!SKIP_ATTRS.has(attr)) {
        passedProps.push(attr);
      }
    }

    usages.push({
      componentName,
      passedProps,
      snippet: `<${componentName}${propsStr.slice(0, 100)}`,
    });
  }

  return usages;
}

/**
 * Validate prop wiring between generated files.
 *
 * @param files - Map of normalized path → content
 * @returns Array of prop wiring issues (empty = all good)
 */
export function validatePropWiring(files: Record<string, string>): PropWiringIssue[] {
  const issues: PropWiringIssue[] = [];

  // Find App.tsx
  const appKey = Object.keys(files).find(k =>
    k === 'App.tsx' || k === '/App.tsx' || k.endsWith('/App.tsx')
  );
  if (!appKey) return []; // Can't validate without App.tsx

  const appContent = files[appKey];
  const appUsages = extractAppRouteUsages(appContent);

  // Build a map of componentName → usages in App.tsx
  const usageMap = new Map<string, AppRouteUsage[]>();
  for (const usage of appUsages) {
    const existing = usageMap.get(usage.componentName) ?? [];
    existing.push(usage);
    usageMap.set(usage.componentName, existing);
  }

  // Check each component file (not App.tsx itself)
  for (const [filePath, content] of Object.entries(files)) {
    if (!filePath.match(/\.(tsx?|jsx?)$/)) continue;
    if (filePath === appKey) continue;

    // Only check page-like files (pages/, screens/, or root-level TSX)
    const norm = filePath.replace(/^\//, '').replace(/^src\//, '');
    const isPage = norm.startsWith('pages/') || norm.startsWith('screens/') ||
                   norm.startsWith('views/') || (!norm.includes('/') && norm !== 'main.tsx');
    if (!isPage) continue;

    const componentName = componentNameFromPath(filePath);
    const { required } = extractComponentProps(content);

    if (required.length === 0) continue; // No required props, skip

    // Find usages in App.tsx
    const usages = usageMap.get(componentName) ?? [];
    if (usages.length === 0) continue; // Not used in App.tsx, skip

    for (const usage of usages) {
      const missing = required.filter(prop => !usage.passedProps.includes(prop));
      if (missing.length > 0) {
        issues.push({
          componentFile: norm,
          componentName,
          requiredProps: required,
          passedProps: usage.passedProps,
          missingProps: missing,
        });
      }
    }
  }

  return issues;
}

/**
 * Format prop wiring issues into a compact LLM-friendly error string.
 */
export function formatPropWiringIssues(issues: PropWiringIssue[]): string {
  if (issues.length === 0) return '';

  const lines = [
    'PROP WIRING ISSUES DETECTED (runtime errors will occur):',
    '',
  ];

  for (const issue of issues) {
    lines.push(`Component: ${issue.componentFile} (<${issue.componentName}>)`);
    lines.push(`  Required props: ${issue.requiredProps.join(', ')}`);
    lines.push(`  Passed by App.tsx: ${issue.passedProps.length > 0 ? issue.passedProps.join(', ') : '(none)'}`);
    lines.push(`  MISSING: ${issue.missingProps.join(', ')}`);
    lines.push('');
  }

  lines.push(
    'FIX REQUIRED: Update App.tsx to initialize state for the missing props and pass them to the components.',
    'Return both the updated App.tsx AND any component files if needed.',
  );

  return lines.join('\n');
}

/**
 * Build the LLM fix prompt for prop wiring issues.
 * Includes App.tsx content + all affected component files.
 */
export function buildPropWiringFixPrompt(
  issues: PropWiringIssue[],
  files: Record<string, string>,
): string {
  const appKey = Object.keys(files).find(k =>
    k === 'App.tsx' || k === '/App.tsx' || k.endsWith('/App.tsx')
  ) ?? 'App.tsx';

  const appContent = files[appKey] ?? '';

  const componentSnippets: string[] = [];
  for (const issue of issues) {
    const content = files[issue.componentFile] ??
      files[`/${issue.componentFile}`] ??
      files[`src/${issue.componentFile}`] ?? '';
    if (content) {
      // Show just the props interface + function signature (first 40 lines)
      const preview = content.split('\n').slice(0, 40).join('\n');
      componentSnippets.push(`// ${issue.componentFile}\n${preview}`);
    }
  }

  return `RUNTIME PROP WIRING ERROR — Fix required before the app works.

${formatPropWiringIssues(issues)}

CURRENT App.tsx:
\`\`\`tsx
${appContent}
\`\`\`

COMPONENT SIGNATURES (showing required props):
${componentSnippets.join('\n\n---\n\n')}

TASK: Rewrite App.tsx to:
1. Add useState hooks for each missing prop (with sensible defaults)
2. Add handler functions (onXxx callbacks) that update the state
3. Pass all required props to each component in the Route element
4. Keep all existing routing, providers, and error boundaries

Return a JSON artifact with the COMPLETE updated App.tsx (and any other files that need changing):
\`\`\`json
{"artifact":{"files":[{"path":"App.tsx","content":"...complete updated App.tsx..."}]}}
\`\`\``;
}
