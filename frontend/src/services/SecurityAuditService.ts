/**
 * SecurityAuditService — static security analysis for generated code.
 *
 * Runs before publish (and optionally after generation) to catch:
 *   1. Dangerous code patterns (eval, innerHTML, dangerouslySetInnerHTML with user data)
 *   2. Hardcoded secrets (API keys, tokens, passwords)
 *   3. Dependency vulnerabilities (known CVE list, client-side only — no npm audit)
 *   4. Supabase RLS gaps (tables used without Row Level Security policies)
 *   5. CORS / fetch security (requests to arbitrary user-controlled URLs)
 *   6. Prototype pollution vectors
 *
 * Output: AuditReport with findings grouped by severity (critical/high/medium/info).
 * Pre-publish gate: blocks if any critical/high findings exist.
 *
 * This is STATIC analysis only — no network calls, no external APIs.
 * Results are deterministic and reproducible for the same file set.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'info';

export interface AuditFinding {
  id:          string;
  severity:    AuditSeverity;
  category:    string;
  file:        string;
  line:        number;
  description: string;
  /** Specific code snippet that triggered this finding. */
  snippet:     string;
  /** Actionable remediation guidance. */
  fix:         string;
  /** OWASP / CWE reference if applicable. */
  reference?:  string;
}

export interface DependencyRisk {
  package:     string;
  severity:    AuditSeverity;
  description: string;
  cve?:        string;
  recommendation: string;
}

export interface AuditReport {
  projectId:   string;
  generatedAt: string;
  fileCount:   number;
  findings:    AuditFinding[];
  depRisks:    DependencyRisk[];
  /** Aggregate pass/fail for pre-publish gate. */
  passed:      boolean;
  /** Summary counts by severity. */
  summary: {
    critical:  number;
    high:      number;
    medium:    number;
    info:      number;
  };
}

// ─── Known vulnerable packages ────────────────────────────────────────────────

/**
 * Lightweight client-side CVE list — only the most common React-ecosystem issues.
 * Intentionally small — not a substitute for `npm audit`.
 */
const KNOWN_VULNERABLE_PACKAGES: DependencyRisk[] = [
  {
    package: 'lodash',
    severity: 'high',
    description: 'lodash versions < 4.17.21 are vulnerable to prototype pollution (CVE-2020-8203)',
    cve: 'CVE-2020-8203',
    recommendation: 'Use lodash@^4.17.21 or use native ES methods instead.',
  },
  {
    package: 'node-fetch',
    severity: 'high',
    description: 'node-fetch < 2.6.7 vulnerable to SSRF (CVE-2022-0235)',
    cve: 'CVE-2022-0235',
    recommendation: 'Use the native fetch API or upgrade to node-fetch@^3.',
  },
  {
    package: 'axios',
    severity: 'medium',
    description: 'axios < 1.6.0 vulnerable to SSRF and ReDoS',
    cve: 'CVE-2023-45857',
    recommendation: 'Upgrade to axios@^1.6.0',
  },
  {
    package: 'marked',
    severity: 'high',
    description: 'marked < 4.3.0 vulnerable to XSS via sanitizer bypass',
    cve: 'CVE-2022-21681',
    recommendation: 'Upgrade to marked@^9.0 and use DOMPurify when rendering HTML.',
  },
  {
    package: 'dompurify',
    severity: 'info',
    description: 'DOMPurify is present — good. Ensure it is called before rendering any HTML.',
    recommendation: 'Continue using DOMPurify.sanitize() before dangerouslySetInnerHTML.',
  },
  {
    package: 'jsonwebtoken',
    severity: 'medium',
    description: 'Avoid using jsonwebtoken client-side — JWTs should be validated server-side only.',
    recommendation: 'Move JWT validation to a Supabase Edge Function or backend route.',
  },
  {
    package: 'eval',
    severity: 'critical',
    description: 'eval package detected — never use dynamic code evaluation.',
    recommendation: 'Remove this package entirely. Use JSON.parse for data, AST parsers for code.',
  },
];

// ─── Code pattern rules ───────────────────────────────────────────────────────

interface CodeRule {
  id:        string;
  category:  string;
  severity:  AuditSeverity;
  pattern:   RegExp;
  description: (match: string) => string;
  fix:       string;
  reference?: string;
  /** If true, this pattern only fires for non-test, non-type files. */
  skipInTests?: boolean;
  /** If true, skip if the line contains this string (false positive suppression). */
  skipIfLine?: string;
}

const CODE_RULES: CodeRule[] = [
  // ── XSS ─────────────────────────────────────────────────────────────────────
  {
    id:       'XSS-001',
    category: 'XSS',
    severity: 'critical',
    pattern:  /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:\s*(?!DOMPurify)/,
    description: () => 'dangerouslySetInnerHTML without DOMPurify sanitization — XSS risk',
    fix:      'Wrap the value with DOMPurify.sanitize(): dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}',
    reference: 'CWE-79',
  },
  {
    id:       'XSS-002',
    category: 'XSS',
    severity: 'high',
    pattern:  /innerHTML\s*=\s*/,
    description: () => 'Direct innerHTML assignment — XSS risk if content is user-controlled',
    fix:      'Use textContent for plain text, or DOMPurify.sanitize() for HTML.',
    reference: 'CWE-79',
    skipIfLine: 'sanitize',
  },
  {
    id:       'XSS-003',
    category: 'XSS',
    severity: 'high',
    pattern:  /document\.write\s*\(/,
    description: () => 'document.write() call — XSS risk and blocks parser',
    fix:      'Use DOM manipulation APIs (createElement, appendChild) instead.',
    reference: 'CWE-79',
  },

  // ── Code injection ───────────────────────────────────────────────────────────
  {
    id:       'INJ-001',
    category: 'Code Injection',
    severity: 'critical',
    pattern:  /\beval\s*\(/,
    description: () => 'eval() usage — arbitrary code execution risk',
    fix:      'Remove eval(). Use JSON.parse() for data, dedicated parsers for code.',
    reference: 'CWE-95',
  },
  {
    id:       'INJ-002',
    category: 'Code Injection',
    severity: 'critical',
    pattern:  /new\s+Function\s*\(/,
    description: () => 'new Function() — equivalent to eval(), code injection risk',
    fix:      'Remove new Function(). Use explicit function definitions.',
    reference: 'CWE-95',
  },
  {
    id:       'INJ-003',
    category: 'Code Injection',
    severity: 'high',
    pattern:  /setTimeout\s*\(\s*["'`]/,
    description: () => 'setTimeout with string argument — equivalent to eval()',
    fix:      'Pass a function reference: setTimeout(() => { ... }, delay)',
    reference: 'CWE-95',
  },

  // ── Hardcoded secrets ────────────────────────────────────────────────────────
  {
    id:       'SEC-001',
    category: 'Hardcoded Secret',
    severity: 'critical',
    pattern:  /(?:apiKey|api_key)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}["']/i,
    description: (m) => `Hardcoded API key detected: ${m.slice(0, 30)}…`,
    fix:      'Move to import.meta.env.VITE_* and add to .env file.',
    reference: 'CWE-312',
    skipIfLine: 'import.meta.env',
  },
  {
    id:       'SEC-002',
    category: 'Hardcoded Secret',
    severity: 'critical',
    pattern:  /(?:password|passwd)\s*[:=]\s*["'][^"']{6,}["']/i,
    description: (m) => `Hardcoded password detected: ${m.slice(0, 30)}…`,
    fix:      'Never hardcode passwords. Use env vars or a secrets manager.',
    reference: 'CWE-259',
    skipIfLine: 'import.meta.env',
  },
  {
    id:       'SEC-003',
    category: 'Hardcoded Secret',
    severity: 'high',
    pattern:  /(?:secret|token)\s*[:=]\s*["'][A-Za-z0-9_\-./+]{16,}["']/i,
    description: (m) => `Hardcoded secret/token: ${m.slice(0, 30)}…`,
    fix:      'Move to import.meta.env.VITE_* and add to .env file.',
    reference: 'CWE-312',
    skipIfLine: 'import.meta.env',
  },

  // ── Prototype pollution ───────────────────────────────────────────────────────
  {
    id:       'PROTO-001',
    category: 'Prototype Pollution',
    severity: 'high',
    pattern:  /\[["']__proto__["']\]/,
    description: () => '__proto__ property access — prototype pollution risk',
    fix:      'Never set or access __proto__. Use Object.create(null) for safe maps.',
    reference: 'CWE-1321',
  },
  {
    id:       'PROTO-002',
    category: 'Prototype Pollution',
    severity: 'medium',
    pattern:  /Object\.prototype\.\w+\s*=/,
    description: () => 'Modifying Object.prototype — pollutes all objects',
    fix:      'Never modify built-in prototypes. Use utility functions instead.',
    reference: 'CWE-1321',
  },

  // ── SQL injection (if raw SQL is used) ───────────────────────────────────────
  {
    id:       'SQL-001',
    category: 'SQL Injection',
    severity: 'critical',
    pattern:  /\.rpc\s*\(\s*["'`][^"'`]*\$\{/,
    description: () => 'Template literal in Supabase RPC call — SQL injection risk',
    fix:      'Use parameterized Supabase queries. Never interpolate user input into SQL.',
    reference: 'CWE-89',
  },
  {
    id:       'SQL-002',
    category: 'SQL Injection',
    severity: 'critical',
    pattern:  /\.from\s*\(\s*[`"].*\$\{/,
    description: () => 'Template literal in Supabase .from() — SQL injection risk',
    fix:      'Use static table names and parameterized filters in Supabase queries.',
    reference: 'CWE-89',
  },

  // ── Open redirect ─────────────────────────────────────────────────────────────
  {
    id:       'REDIRECT-001',
    category: 'Open Redirect',
    severity: 'medium',
    pattern:  /window\.location\s*=\s*(?!["']\/|["']https?:\/\/[a-z]+)/,
    description: () => 'window.location assignment with dynamic value — open redirect risk',
    fix:      'Validate redirect targets against an allowlist before navigating.',
    reference: 'CWE-601',
  },

  // ── Sensitive data exposure ────────────────────────────────────────────────────
  {
    id:       'DATA-001',
    category: 'Sensitive Data',
    severity: 'medium',
    pattern:  /console\.log\s*\(.*(?:password|token|secret|apiKey|key)/i,
    description: () => 'Sensitive data potentially logged to console',
    fix:      'Remove console.log statements that may expose sensitive data.',
    reference: 'CWE-532',
  },
  {
    id:       'DATA-002',
    category: 'Sensitive Data',
    severity: 'info',
    pattern:  /localStorage\.setItem\s*\(\s*["'][^"']*(?:password|secret|token)["']/i,
    description: () => 'Sensitive data stored in localStorage — prefer sessionStorage or secure cookies',
    fix:      'Use secure httpOnly cookies for sensitive data. localStorage is readable by all JS on the page.',
    reference: 'CWE-312',
  },

  // ── CORS / fetch ──────────────────────────────────────────────────────────────
  {
    id:       'CORS-001',
    category: 'CORS / Fetch',
    severity: 'medium',
    pattern:  /fetch\s*\(\s*(?:req\.|params\.|props\.|state\.|query\.)/,
    description: () => 'fetch() with potentially user-controlled URL — SSRF risk',
    fix:      'Validate and whitelist URLs before using them in fetch(). Use a server-side proxy for external API calls.',
    reference: 'CWE-918',
  },
];

// ─── Supabase RLS checker ─────────────────────────────────────────────────────

/**
 * Detect Supabase table access without RLS hints in the schema.
 * Heuristic: if SQL schema is present and a table is defined without
 * `enable row level security`, flag it.
 */
function checkRls(files: Record<string, string>): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith('.sql')) continue;
    // Find CREATE TABLE statements
    const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/gi;
    let m: RegExpExecArray | null;
    while ((m = tableRe.exec(content)) !== null) {
      const tableName = m[1];
      // Check if ALTER TABLE ... ENABLE ROW LEVEL SECURITY exists for this table
      const rlsPattern = new RegExp(
        `ALTER\\s+TABLE\\s+(?:[\\w."]+\\.)?["']?${tableName}["']?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i',
      );
      if (!rlsPattern.test(content)) {
        findings.push({
          id:          `RLS-${tableName.toUpperCase()}`,
          severity:    'high',
          category:    'Supabase RLS',
          file:        path,
          line:        (content.slice(0, m.index).match(/\n/g) ?? []).length + 1,
          description: `Table "${tableName}" has no Row Level Security enabled`,
          snippet:     m[0].slice(0, 60),
          fix:         `Add: ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY; and appropriate RLS policies.`,
          reference:   'Supabase RLS docs',
        });
      }
    }
  }
  return findings;
}

// ─── Main audit function ──────────────────────────────────────────────────────

/**
 * Run the full security audit on a file set.
 *
 * @param files     The generated files to scan (path → content).
 * @param projectId For report attribution.
 * @returns AuditReport with all findings.
 */
export function runSecurityAudit(
  files:     Record<string, string>,
  projectId: string,
): AuditReport {
  const findings: AuditFinding[] = [];
  const depRisks: DependencyRisk[] = [];

  const SKIP_EXTENSIONS = ['.json', '.md', '.svg', '.png', '.jpg', '.gif', '.ico', '.woff'];
  const TEST_PATTERNS   = ['.test.', '.spec.', '__tests__'];

  for (const [filePath, content] of Object.entries(files)) {
    if (SKIP_EXTENSIONS.some(ext => filePath.endsWith(ext))) continue;

    const isTest = TEST_PATTERNS.some(p => filePath.includes(p));
    const lines  = content.split('\n');

    for (const rule of CODE_RULES) {
      if (rule.skipInTests && isTest) continue;

      rule.pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rule.pattern.exec(content)) !== null) {
        const upTo   = content.slice(0, m.index);
        const lineNo = (upTo.match(/\n/g) ?? []).length + 1;
        const lineContent = lines[lineNo - 1] ?? '';

        // False positive suppression
        if (rule.skipIfLine && lineContent.includes(rule.skipIfLine)) {
          continue;
        }
        // Skip commented-out lines
        if (/^\s*\/\//.test(lineContent) || /^\s*\*/.test(lineContent)) continue;

        findings.push({
          id:          `${rule.id}-${findings.length}`,
          severity:    rule.severity,
          category:    rule.category,
          file:        filePath,
          line:        lineNo,
          description: rule.description(m[0]),
          snippet:     m[0].slice(0, 80),
          fix:         rule.fix,
          reference:   rule.reference,
        });
      }
    }
  }

  // RLS check
  findings.push(...checkRls(files));

  // Dependency check
  const allContent = Object.values(files).join('\n');
  for (const risk of KNOWN_VULNERABLE_PACKAGES) {
    const importRe = new RegExp(`from\\s+['"]${risk.package}(?:/[^'"]*)?['"]`);
    if (importRe.test(allContent)) {
      depRisks.push(risk);
    }
  }

  // Count by severity
  const summary = { critical: 0, high: 0, medium: 0, info: 0 };
  for (const f of findings) summary[f.severity]++;
  for (const r of depRisks)  if (r.severity !== 'info') summary[r.severity]++;

  const passed = summary.critical === 0 && summary.high === 0;

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    fileCount:   Object.keys(files).length,
    findings,
    depRisks,
    passed,
    summary,
  };
}

/**
 * Quick check — returns true if the file set is safe to publish.
 * Use runSecurityAudit() for the full report.
 */
export function isSecureForPublish(
  files:     Record<string, string>,
  projectId: string,
): { passed: boolean; blockers: string[] } {
  const report  = runSecurityAudit(files, projectId);
  const blockers = [
    ...report.findings
      .filter(f => f.severity === 'critical' || f.severity === 'high')
      .map(f => `[${f.severity.toUpperCase()}] ${f.file}:${f.line} — ${f.description}`),
    ...report.depRisks
      .filter(r => r.severity === 'critical' || r.severity === 'high')
      .map(r => `[${r.severity.toUpperCase()}] Package ${r.package} — ${r.description}`),
  ];
  return { passed: report.passed, blockers };
}
