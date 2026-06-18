import type { FeatureChecklistItem } from './ProductDocumentSet';
import type { ProjectPlan } from './types/ProjectPlan';

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface CompletenessGateCoverage {
  mustTotal: number;
  mustCovered: number;
  shouldTotal: number;
  shouldCovered: number;
  coverageRatioMust: number;
  coverageRatioAll: number;
  uncoveredMust: string[];
  uncoveredShould: string[];
  completenessGateStatus: 'pass' | 'fail';
  completenessGateReason: string;
  // Legacy fields — retained for backward compatibility
  requiredPageCount: number;
  coveredPageCount: number;
  missingPageFiles: string[];
  requiredCapabilityCount: number;
  coveredCapabilityCount: number;
  missingCapabilities: string[];
}

export interface CompletenessGateResult {
  ok: boolean;
  blockingReasons: string[];
  repairInstructions: string[];
  coverage: CompletenessGateCoverage;
}

export interface CompletenessGateInput {
  /** Primary input: featureChecklist from ProductDocumentSet. */
  featureChecklist?: FeatureChecklistItem[];
  generatedFiles: Record<string, string>;
  skeletonFiles?: readonly string[];
  /** Fallback when featureChecklist is not provided. */
  prebuiltPlan?: ProjectPlan | null;
}

// ── Capability signal rules ───────────────────────────────────────────────────

const CAPABILITY_SIGNAL_RULES: Record<string, RegExp[]> = {
  auth: [
    /\bauth\b/i,
    /\blogin\b/i,
    /\bsign[\s-]?in\b/i,
    /\bsession\b/i,
    /\bprotected\b/i,
  ],
  backend: [
    /\bsupabase\b/i,
    /\bdatabase\b/i,
    /\bpersist/i,
    /\bapi\b/i,
    /\bfetch\s*\(/i,
  ],
  ai_chat: [
    /\bchat\b/i,
    /\bassistant\b/i,
    /\bprompt\b/i,
    /\bcompletion\b/i,
    /\bllm\b/i,
  ],
  ai_generation: [
    /\bgenerate/i,
    /\bprompt\b/i,
    /\bassistant\b/i,
    /\bllm\b/i,
    /\bmodel\b/i,
  ],
  storage: [
    /\bupload\b/i,
    /\bstorage\b/i,
    /\battachment\b/i,
    /\basset\b/i,
  ],
  payments: [
    /\bstripe\b/i,
    /\bcheckout\b/i,
    /\bpayment\b/i,
    /\bbilling\b/i,
  ],
  analytics: [
    /\banalytics\b/i,
    /\breport/i,
    /\bmetric/i,
    /\bdashboard\b/i,
  ],
};

// ── Path normalization ────────────────────────────────────────────────────────

function normalizeOutputPath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\/+/, '')
    .replace(/^src\/+/, '');
}

// ── Content quality checks ────────────────────────────────────────────────────

function isEmptyFile(content: string): boolean {
  return content.trim().length === 0;
}

// Matches import lines or re-export-only lines (not real declarations like export function/const/class)
const IMPORT_OR_REEXPORT_LINE = /^(import\s|export\s*\{|export\s*type\s*\{|export\s*\*\s*from|export\s*default\s+from)/;

function isImportsOnlyFile(content: string): boolean {
  const meaningfulLines = content
    .split('\n')
    .map(l => l.trim())
    .filter(l =>
      Boolean(l)
      && !IMPORT_OR_REEXPORT_LINE.test(l)
      && !l.startsWith('//')
      && !l.startsWith('/*')
      && !l.startsWith('*')
      && l !== '{'
      && l !== '}'
      && l !== ';'
    );
  return meaningfulLines.length < 2;
}

function returnsNullOrEmpty(content: string): boolean {
  return (
    /return\s+null\s*[;)]/m.test(content)
    || /=>\s*null\b/.test(content)
    || /return\s*\(\s*<>\s*<\/>\s*\)/m.test(content)
    || /return\s*\(\s*\n?\s*\)/m.test(content)
  );
}

const PLACEHOLDER_PATTERNS = [
  /coming\s+soon/i,
  /\bfeature\s+\d+\b/i,
  /\bkpi\s+\d+\b/i,
  /\bmetric\s+\d+\b/i,
  /\btodo\b/i,
  /lorem\s+ipsum/i,
  /placeholder\s+content/i,
  /not\s+yet\s+implemented/i,
];

function hasPlaceholderContent(content: string): boolean {
  return PLACEHOLDER_PATTERNS.some(p => p.test(content));
}

// ── False-positive pattern detectors ─────────────────────────────────────────

function hasFakeNotification(content: string): boolean {
  const hasUi = (
    /notification.*toggle/i.test(content)
    || /toggle.*notification/i.test(content)
    || /enable.*notification/i.test(content)
    || /push.*notification/i.test(content)
    || /notification.*switch/i.test(content)
    || /notification.*button/i.test(content)
  );
  if (!hasUi) return false;
  return (
    !(/Notification\.requestPermission/).test(content)
    && !(/Notification\.permission/).test(content)
  );
}

function hasFakePaywall(content: string): boolean {
  const hasUi = (
    /paywall/i.test(content)
    || /upgrade.*plan/i.test(content)
    || /premium.*banner/i.test(content)
    || /subscription.*required/i.test(content)
    || /unlock.*premium/i.test(content)
    || /upgrade.*to.*premium/i.test(content)
  );
  if (!hasUi) return false;
  return (
    !(/subscriptionGate/).test(content)
    && !(/createFlowGate/).test(content)
    && !(/isPremium\b/).test(content)
    && !(/subscription\.status/).test(content)
    && !(/plan\s*===?\s*['"]free/).test(content)
    && !(/canCreate\b/).test(content)
    && !(/hasAccess\b/).test(content)
    && !(/userPlan/).test(content)
  );
}

function hasFakeReminder(content: string): boolean {
  const hasUi = (
    /reminder\s+time/i.test(content)
    || /set\s+reminder/i.test(content)
    || /reminder.*toggle/i.test(content)
    || /schedule.*reminder/i.test(content)
    || /daily\s+reminder/i.test(content)
    || /reminder.*button/i.test(content)
  );
  if (!hasUi) return false;
  return (
    !(/localStorage\.setItem.*reminder/i).test(content)
    && !(/reminderConfig/i).test(content)
    && !(/reminderTime\b/i).test(content)
    && !(/reminderEnabled\b/i).test(content)
    && !(/setReminder\b/i).test(content)
    && !(/useReminder\b/i).test(content)
    && !(/reminderStore/i).test(content)
  );
}

function hasCoachWithoutMessageFlow(content: string): boolean {
  const hasUi = (
    /coach.*page/i.test(content)
    || /coaching/i.test(content)
    || /send\s+message/i.test(content)
    || /message\s+input/i.test(content)
    || /<CoachPage/i.test(content)
    || /coach.*chat/i.test(content)
    || /coach.*component/i.test(content)
  );
  if (!hasUi) return false;
  const hasMessageState = (
    /useState.*messages/.test(content)
    || /messages.*useState/.test(content)
    || /const\s+\[messages/.test(content)
    || /setMessages\b/.test(content)
    || /messages:\s*\[/.test(content)
  );
  const hasSendHandler = (
    /sendMessage\b/.test(content)
    || /handleSend\b/.test(content)
    || /onSend\b/.test(content)
    || /handleMessageSend/.test(content)
    || /submitMessage\b/.test(content)
  );
  return !hasMessageState || !hasSendHandler;
}

// ── Surface-based false-positive dispatch ─────────────────────────────────────

function checkFalsePositivePatterns(item: FeatureChecklistItem, content: string): string | null {
  const ctx = `${item.surface} ${item.briefPoint}`.toLowerCase();

  if (/notif/.test(ctx)) {
    if (hasFakeNotification(content)) {
      return 'notification UI present but Notification.requestPermission absent';
    }
  }

  if (/paywall|subscri.*required|premium.*banner|unlock.*premium/.test(ctx)) {
    if (hasFakePaywall(content)) {
      return 'paywall UI present but no create-flow gate found';
    }
  }

  if (/\breminder\b/.test(ctx)) {
    if (hasFakeReminder(content)) {
      return 'reminder UI present but no persisted reminder config found';
    }
  }

  if (/\bcoach\b/.test(ctx)) {
    if (hasCoachWithoutMessageFlow(content)) {
      return 'coach UI present but message state or send interaction missing';
    }
  }

  return null;
}

// ── Item coverage evaluation ──────────────────────────────────────────────────

interface ItemCoverageResult {
  covered: boolean;
  failReason?: string;
}

function evaluateItemCoverage(
  item: FeatureChecklistItem,
  normalizedFileMap: Map<string, string>,
  availableFiles: Set<string>,
): ItemCoverageResult {
  const normalizedTargetFiles = item.targetFiles
    .map(normalizeOutputPath)
    .filter(Boolean);

  if (normalizedTargetFiles.length === 0) {
    return { covered: false, failReason: 'no targetFiles defined' };
  }

  const foundInGenerated = normalizedTargetFiles.filter(f => normalizedFileMap.has(f));
  const foundAnywhere = normalizedTargetFiles.some(f => availableFiles.has(f));

  if (foundInGenerated.length === 0 && !foundAnywhere) {
    return {
      covered: false,
      failReason: `target file(s) missing: ${normalizedTargetFiles.join(', ')}`,
    };
  }

  // Quality-check generated files
  for (const filePath of foundInGenerated) {
    const content = normalizedFileMap.get(filePath) ?? '';

    if (isEmptyFile(content)) {
      return { covered: false, failReason: `${filePath}: file is empty` };
    }

    if (isImportsOnlyFile(content)) {
      return { covered: false, failReason: `${filePath}: file contains only imports/exports` };
    }

    if (returnsNullOrEmpty(content)) {
      return { covered: false, failReason: `${filePath}: component returns null or empty fragment` };
    }

    if (hasPlaceholderContent(content)) {
      return { covered: false, failReason: `${filePath}: file contains placeholder content` };
    }

    const fakeIssue = checkFalsePositivePatterns(item, content);
    if (fakeIssue) {
      return { covered: false, failReason: `${filePath}: ${fakeIssue}` };
    }
  }

  // Capability signal check for capability-id items
  if (item.id.startsWith('capability-')) {
    const capId = item.surface;
    const rules = CAPABILITY_SIGNAL_RULES[capId];
    if (rules && rules.length > 0) {
      const targetCorpus = foundInGenerated.map(f => normalizedFileMap.get(f) ?? '').join('\n');
      if (!rules.some(r => r.test(targetCorpus))) {
        const allCorpus = [...normalizedFileMap.values()].join('\n');
        if (!rules.some(r => r.test(allCorpus))) {
          return {
            covered: false,
            failReason: `capability "${capId}" implementation signals absent from generated output`,
          };
        }
      }
    }
  }

  return { covered: true };
}

// ── Feature-checklist path (primary) ─────────────────────────────────────────

function evaluateFeatureChecklist(
  featureChecklist: FeatureChecklistItem[],
  generatedFiles: Record<string, string>,
  availableFiles: Set<string>,
): CompletenessGateResult {
  const normalizedFileMap = new Map<string, string>();
  for (const [key, content] of Object.entries(generatedFiles)) {
    normalizedFileMap.set(normalizeOutputPath(key), content);
  }

  const mustItems = featureChecklist.filter(item => item.priority === 'must');
  const shouldItems = featureChecklist.filter(item => item.priority === 'should');

  const uncoveredMust: string[] = [];
  const uncoveredShould: string[] = [];
  const blockingReasons: string[] = [];
  const repairInstructions: string[] = [];

  for (const item of mustItems) {
    const result = evaluateItemCoverage(item, normalizedFileMap, availableFiles);
    if (!result.covered) {
      uncoveredMust.push(item.briefPoint);
      blockingReasons.push(`[must] ${item.briefPoint}: ${result.failReason ?? 'coverage check failed'}`);
      repairInstructions.push(`Implement "${item.briefPoint}" with concrete code, not placeholder.`);
    }
  }

  for (const item of shouldItems) {
    const result = evaluateItemCoverage(item, normalizedFileMap, availableFiles);
    if (!result.covered) {
      uncoveredShould.push(item.briefPoint);
    }
  }

  const mustTotal = mustItems.length;
  const mustCovered = mustTotal - uncoveredMust.length;
  const shouldTotal = shouldItems.length;
  const shouldCovered = shouldTotal - uncoveredShould.length;
  const total = mustTotal + shouldTotal;
  const totalCovered = mustCovered + shouldCovered;
  const coverageRatioMust = mustTotal === 0 ? 1.0 : mustCovered / mustTotal;
  const coverageRatioAll = total === 0 ? 1.0 : totalCovered / total;

  const gatePassed = coverageRatioMust >= 0.8;
  const completenessGateStatus: 'pass' | 'fail' = gatePassed ? 'pass' : 'fail';
  const completenessGateReason = gatePassed
    ? `Must-feature coverage ${(coverageRatioMust * 100).toFixed(0)}% (${mustCovered}/${mustTotal})`
    : `Must-feature coverage ${(coverageRatioMust * 100).toFixed(0)}% (${mustCovered}/${mustTotal}) — minimum 80% required`;

  return {
    ok: gatePassed,
    blockingReasons: gatePassed ? [] : blockingReasons,
    repairInstructions: gatePassed ? [] : repairInstructions,
    coverage: {
      mustTotal,
      mustCovered,
      shouldTotal,
      shouldCovered,
      coverageRatioMust,
      coverageRatioAll,
      uncoveredMust,
      uncoveredShould,
      completenessGateStatus,
      completenessGateReason,
      // Legacy fields
      requiredPageCount: mustTotal,
      coveredPageCount: mustCovered,
      missingPageFiles: uncoveredMust,
      requiredCapabilityCount: 0,
      coveredCapabilityCount: 0,
      missingCapabilities: [],
    },
  };
}

// ── Legacy prebuiltPlan path (fallback) ──────────────────────────────────────

function buildCapabilitySignalCorpus(files: Record<string, string>, skeletonFiles: readonly string[]): string {
  const fileCorpus = Object.entries(files)
    .map(([filePath, content]) => `${normalizeOutputPath(filePath)}\n${content}`)
    .join('\n');
  const skeletonCorpus = skeletonFiles.map(filePath => normalizeOutputPath(filePath)).join('\n');
  return `${fileCorpus}\n${skeletonCorpus}`;
}

function evaluateLegacyPlan(
  prebuiltPlan: ProjectPlan | null | undefined,
  generatedFiles: Record<string, string>,
  availableFiles: Set<string>,
  skeletonFiles: readonly string[],
): CompletenessGateResult {
  if (!prebuiltPlan) {
    return {
      ok: true,
      blockingReasons: [],
      repairInstructions: [],
      coverage: {
        mustTotal: 0,
        mustCovered: 0,
        shouldTotal: 0,
        shouldCovered: 0,
        coverageRatioMust: 1.0,
        coverageRatioAll: 1.0,
        uncoveredMust: [],
        uncoveredShould: [],
        completenessGateStatus: 'pass',
        completenessGateReason: 'No plan provided — gate skipped',
        requiredPageCount: 0,
        coveredPageCount: 0,
        missingPageFiles: [],
        requiredCapabilityCount: 0,
        coveredCapabilityCount: 0,
        missingCapabilities: [],
      },
    };
  }

  const requiredPageFiles = Array.from(new Set(
    (prebuiltPlan.pages ?? [])
      .map(page => normalizeOutputPath(page.file ?? ''))
      .filter(Boolean),
  ));
  const missingPageFiles = requiredPageFiles.filter(filePath => !availableFiles.has(filePath));

  const requiredCapabilities = Array.from(new Set(
    [
      ...((prebuiltPlan.kickoffScope as { selectedCapabilityIds?: string[] } | undefined)?.selectedCapabilityIds ?? []),
      ...((prebuiltPlan.architectKickoff as { selectedCapabilityIds?: string[] } | undefined)?.selectedCapabilityIds ?? []),
    ]
      .map(capability => capability.trim())
      .filter(Boolean),
  ));
  const corpus = buildCapabilitySignalCorpus(generatedFiles, skeletonFiles);
  const missingCapabilities = requiredCapabilities.filter(capability => {
    const explicitRules = CAPABILITY_SIGNAL_RULES[capability];
    if (explicitRules && explicitRules.some(rule => rule.test(corpus))) return false;
    return !new RegExp(`\\b${capability.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(corpus);
  });

  const blockingReasons: string[] = [];
  const repairInstructions: string[] = [];

  if (missingPageFiles.length > 0) {
    blockingReasons.push(
      `Completeness gate: ${missingPageFiles.length} required page file(s) from the saved product plan are missing (${missingPageFiles.join(', ')})`,
    );
    repairInstructions.push(
      `Rebuild the missing required page files from the saved product plan: ${missingPageFiles.join(', ')}.`,
    );
  }

  if (missingCapabilities.length > 0) {
    blockingReasons.push(
      `Completeness gate: saved must-capabilities are not visible in the generated output (${missingCapabilities.join(', ')})`,
    );
    repairInstructions.push(
      `Make the missing must-capabilities concrete in the shipped prototype, not just in notes (${missingCapabilities.join(', ')}).`,
    );
  }

  const ok = blockingReasons.length === 0;
  return {
    ok,
    blockingReasons,
    repairInstructions,
    coverage: {
      mustTotal: requiredPageFiles.length,
      mustCovered: requiredPageFiles.length - missingPageFiles.length,
      shouldTotal: 0,
      shouldCovered: 0,
      coverageRatioMust: requiredPageFiles.length === 0 ? 1.0 : (requiredPageFiles.length - missingPageFiles.length) / requiredPageFiles.length,
      coverageRatioAll: requiredPageFiles.length === 0 ? 1.0 : (requiredPageFiles.length - missingPageFiles.length) / requiredPageFiles.length,
      uncoveredMust: missingPageFiles,
      uncoveredShould: [],
      completenessGateStatus: ok ? 'pass' : 'fail',
      completenessGateReason: ok
        ? 'All required pages and capabilities present'
        : `Missing pages or capabilities: ${[...missingPageFiles, ...missingCapabilities].join(', ')}`,
      requiredPageCount: requiredPageFiles.length,
      coveredPageCount: requiredPageFiles.length - missingPageFiles.length,
      missingPageFiles,
      requiredCapabilityCount: requiredCapabilities.length,
      coveredCapabilityCount: requiredCapabilities.length - missingCapabilities.length,
      missingCapabilities,
    },
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

export function evaluateCompletenessGate(input: CompletenessGateInput): CompletenessGateResult {
  const skeletonFiles = input.skeletonFiles ?? [];
  const availableFiles = new Set<string>([
    ...Object.keys(input.generatedFiles).map(normalizeOutputPath),
    ...skeletonFiles.map(normalizeOutputPath),
  ]);

  if (input.featureChecklist && input.featureChecklist.length > 0) {
    return evaluateFeatureChecklist(input.featureChecklist, input.generatedFiles, availableFiles);
  }

  return evaluateLegacyPlan(input.prebuiltPlan, input.generatedFiles, availableFiles, skeletonFiles);
}
