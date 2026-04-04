/**
 * ScannerService — Component Discovery Engine (Fusion Protocol v1)
 *
 * Scans the user's live project files to build a ComponentRegistry.
 * The registry is injected into Orchestrator's system prompt so the AI
 * assembles UI from *real* project components instead of generating
 * redundant <div> soup.
 *
 * Auto-triggered by useStudio on every file change (debounced 3 s).
 * Manual trigger: ScannerService.scan(files)
 *
 * Usage in prompts: ScannerService.buildPromptContext()
 */

// ── Public types ──────────────────────────────────────────────────────────────

export interface PropDef {
  name:     string;
  type:     string;
  required: boolean;
}

export interface ComponentEntry {
  name:      string;       // e.g. "Button"
  filePath:  string;       // e.g. "/Button.tsx"
  props:     PropDef[];
  variants?: string[];     // values from `variant?: 'primary' | 'ghost'`
  source:    'user';
}

export interface ComponentRegistry {
  scannedAt:       string;
  totalComponents: number;
  components:      ComponentEntry[];
}

import { metricsService } from './MetricsService';

// ── Parser helpers ─────────────────────────────────────────────────────────────

/**
 * Extract prop definitions from the component's Props interface/type.
 * Handles both: `interface ButtonProps { ... }` and `type ButtonProps = { ... }`
 */
function extractProps(componentName: string, content: string): PropDef[] {
  const ifaceRe = new RegExp(
    `(?:interface|type)\\s+${componentName}Props\\s*(?:=\\s*)?\\{([^}]+)\\}`,
    's',
  );
  const block = content.match(ifaceRe)?.[1];
  if (!block) return [];

  const props: PropDef[] = [];
  const propRe = /(\w+)(\??)\s*:\s*([^;\n]+)/g;
  let pm: RegExpExecArray | null;
  while ((pm = propRe.exec(block)) !== null) {
    // Skip comment lines and common non-prop patterns
    const name = pm[1];
    if (name === 'return' || name === 'export' || name === 'const') continue;
    props.push({ name, type: pm[3].trim().replace(/\/\/.*$/, '').trim(), required: pm[2] !== '?' });
  }
  return props.slice(0, 10); // cap to 10 most relevant props
}

/**
 * Extract variant values from a `variant` prop type union.
 * e.g.  variant?: 'primary' | 'secondary' | 'ghost'  →  ['primary', 'secondary', 'ghost']
 */
function extractVariants(content: string): string[] {
  const m = content.match(/variant\s*\??\s*:\s*([^;\n]+)/);
  if (!m) return [];
  const values: string[] = [];
  const valRe = /'([^']+)'/g;
  let vm: RegExpExecArray | null;
  while ((vm = valRe.exec(m[1])) !== null) values.push(vm[1]);
  return values;
}

/** True for SCREAMING_SNAKE or single-char — not a component name */
function isNotComponentName(name: string): boolean {
  return name.length <= 1 || /^[A-Z][A-Z0-9_]+$/.test(name);
}

/**
 * Parse a single file — three-pass semantic scanner.
 *
 * Pass 1 — Explicit exports (high confidence):
 *   export default function Foo / export const Foo / React.FC pattern
 *
 * Pass 2 — Content-based JSX detection (catches inline & non-exported):
 *   Scans every named function/const body for a `return (<JSX` pattern.
 *   Catches shadcn-style and library wrapper components that don't export explicitly.
 *
 * Pass 3 — File-name fallback:
 *   If the file clearly contains JSX but no names were found, register the
 *   PascalCase file stem (e.g., "Button" from "/Button.tsx").
 */
function parseFile(filePath: string, content: string): ComponentEntry[] {
  const found = new Set<string>();

  // ── Pass 1: Explicit export / React annotation patterns ─────────────────────
  const exportPatterns: RegExp[] = [
    /export\s+default\s+function\s+([A-Z][a-zA-Z0-9]*)\s*[(<]/g,
    /export\s+const\s+([A-Z][a-zA-Z0-9]*)\s*[:=]/g,
    /export\s+function\s+([A-Z][a-zA-Z0-9]*)\s*[(<]/g,
    /const\s+([A-Z][a-zA-Z0-9]*)\s*:\s*React\.(?:FC|memo|forwardRef)/g,
    /const\s+([A-Z][a-zA-Z0-9]*)\s*=\s*(?:React\.)?(?:memo|forwardRef)\s*[(<]/g,
  ];
  for (const re of exportPatterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const name = m[1];
      if (/^[A-Z]/.test(name) && !isNotComponentName(name)) found.add(name);
    }
  }

  // ── Pass 2: Semantic JSX body scan ──────────────────────────────────────────
  // Matches: `function Foo(` or `const Foo = (...) =>`
  const funcHeadRe = /(?:function\s+([A-Z][a-zA-Z0-9]*)\s*[(<]|const\s+([A-Z][a-zA-Z0-9]*)\s*=\s*(?:async\s+)?\([^)]{0,120}\)\s*(?::\s*[^={>]{1,60})?\s*=>)\s*[({]/g;
  let fm: RegExpExecArray | null;
  while ((fm = funcHeadRe.exec(content)) !== null) {
    const name = fm[1] ?? fm[2];
    if (!name || isNotComponentName(name)) continue;
    // Scan body for JSX return (don't bother walking braces — just look ahead 4 KB)
    const lookahead = content.slice(fm.index, fm.index + 4096);
    if (/return\s*[\n\r\s]*\(?\s*<[A-Za-z/]/.test(lookahead)) {
      found.add(name);
    }
  }

  // ── Pass 3: File-stem fallback ───────────────────────────────────────────────
  // If the file has JSX but nothing matched yet, use the PascalCase file name.
  if (found.size === 0 && /return\s*[\n\r\s]*\(?\s*<[A-Za-z/]/.test(content)) {
    const stem = filePath.split('/').pop()?.replace(/\.(tsx?|jsx?)$/i, '') ?? '';
    if (/^[A-Z]/.test(stem) && !isNotComponentName(stem)) found.add(stem);
  }

  return [...found].map(name => {
    const variants = extractVariants(content);
    return {
      name,
      filePath,
      props:    extractProps(name, content),
      variants: variants.length > 0 ? variants : undefined,
      source:   'user' as const,
    };
  });
}

// ── Service singleton ──────────────────────────────────────────────────────────

let _registry: ComponentRegistry | null = null;
const _listeners = new Set<(r: ComponentRegistry) => void>();

export const ScannerService = {

  get registry(): ComponentRegistry | null { return _registry; },

  /**
   * Scan user project files and rebuild the ComponentRegistry.
   * Safe to call frequently — logs a single activation message to console.
   */
  scan(files: Record<string, string>): ComponentRegistry {
    const _t0 = Date.now();
    const all: ComponentEntry[] = [];
    const totalFiles    = Object.keys(files).length;
    const scannedPaths: string[] = [];

    for (const [path, content] of Object.entries(files)) {
      // Accept .ts .tsx .js .jsx
      if (!/\.(tsx?|jsx?)$/i.test(path)) continue;
      scannedPaths.push(path);
      try {
        const found = parseFile(path, content);
        if (found.length > 0) {
          console.log(`[ScannerService] ✅ ${path} → ${found.map(c => c.name).join(', ')}`);
        }
        all.push(...found);
      } catch (err) {
        console.warn(`[ScannerService] ⚠️ parse error in ${path}:`, err);
      }
    }

    // Deduplicate by component name — last definition wins (most recently upserted file)
    const deduped = [...new Map(all.map(c => [c.name, c])).values()];

    _registry = {
      scannedAt:       new Date().toISOString(),
      totalComponents: deduped.length,
      components:      deduped,
    };

    _listeners.forEach(cb => cb(_registry!));

    // Diagnostic group — check DevTools console to diagnose 0-count issues
    console.groupCollapsed(
      `[ScannerService] ${deduped.length} components | ${scannedPaths.length}/${totalFiles} files eligible`,
    );
    console.log('All file keys received:', Object.keys(files));
    console.log('Eligible (.ts/.tsx/.js/.jsx) paths:', scannedPaths);
    if (deduped.length > 0) {
      console.log('Registered:', deduped.map(c => `${c.name} @ ${c.filePath}`));
    } else {
      console.warn(
        'Zero components found. Possible causes:\n' +
        '  1. No code generated yet — files object empty or non-JS only\n' +
        '  2. Components come from libraries (shadcn, MUI) — NOT in editor files\n' +
        '  3. Exports use non-PascalCase names (ALL_CAPS, single char, etc.)\n' +
        '  → Check "All file keys received" above for what the scanner got.',
      );
    }
    console.groupEnd();

    console.log(
      `[ScannerService] активен. В реестр занесено ${deduped.length} компонентов. ` +
      `Система готова к интеллектуальному слиянию.`,
    );

    metricsService.record({ phase: 'scanner', durationMs: Date.now() - _t0, extra: { components: deduped.length, files: scannedPaths.length } });

    return _registry;
  },

  /**
   * Build the prompt-injection block for Orchestrator.
   * Returns empty string if no registry or no components found.
   */
  buildPromptContext(): string {
    if (!_registry || _registry.components.length === 0) return '';

    const lines: string[] = [
      `══════════════════════════════════════════════════════`,
      `  🧩 FUSION PROTOCOL — COMPONENT REGISTRY (${_registry.totalComponents} components)`,
      `══════════════════════════════════════════════════════`,
      ``,
      `PRIME DIRECTIVE: Before generating ANY new UI element, consult this registry.`,
      `If a matching component exists → USE IT. NEVER recreate it with plain <div> markup.`,
      `All listed components are already in scope (concatenated before App.tsx). NO imports needed.`,
      ``,
      `Available components:`,
    ];

    for (const comp of _registry.components) {
      const variantsStr = comp.variants?.length
        ? ` [variants: ${comp.variants.map(v => `"${v}"`).join(' | ')}]`
        : '';
      lines.push(`  • <${comp.name}>${variantsStr}  ← ${comp.filePath}`);
      if (comp.props.length > 0) {
        const propsStr = comp.props
          .slice(0, 6)
          .map(p => `${p.name}${p.required ? '' : '?'}: ${p.type}`)
          .join(', ');
        lines.push(`    props: { ${propsStr} }`);
      }
    }

    lines.push(``);
    lines.push(`✅ CORRECT:  <Button variant="primary" onClick={fn}>Save</Button>`);
    lines.push(`❌ FORBIDDEN: <div className="btn btn-primary" onClick={fn}>Save</div>  ← if Button is in registry`);

    return lines.join('\n');
  },

  /** Subscribe to registry updates. Returns unsubscribe fn. */
  onScan(cb: (r: ComponentRegistry) => void): () => void {
    _listeners.add(cb);
    return () => _listeners.delete(cb);
  },
};
