import { VISUAL_PRESETS } from '../../shared/designSystem';
import type {
  FileBlueprint,
  GenerationResult,
  VisualQualityBand,
  VisualQualityDimensionId,
  VisualQualityDimensionSummary,
  VisualQualityEvidence,
  VisualQualitySummary,
  VisualQualityVerdict,
} from '../../shared/projectModel';
import type { StyleId } from '../designSystem/categories';
import { getStyleDefinition } from '../designSystem/styles';

export type { VisualQualitySummary } from '../../shared/projectModel';

type CollectedSignals = {
  headingCount: number;
  h1FilesWithMultipleTitles: number;
  landmarkCount: number;
  buttonCount: number;
  linkCount: number;
  formCount: number;
  primaryActionCount: number;
  emptyStateCount: number;
  loadingStateCount: number;
  errorStateCount: number;
  responsiveSignalCount: number;
  viewportHelperCount: number;
  fixedWidthCount: number;
  tagCount: number;
  pageTagCount: number;
  pageLikeFileCount: number;
  spacingValuesPx: number[];
  spacingTokens: Set<string>;
  offScaleSpacingCount: number;
  iconLibraries: Set<string>;
  fontFamilies: Set<string>;
  hexColors: Set<string>;
  arbitraryColorUsageCount: number;
  stateFileHints: Set<'empty' | 'loading' | 'error'>;
};

type EvaluationContext = {
  signals: CollectedSignals;
  pageFiles: FileBlueprint[];
  routeCount: number;
  routeManifestCount: number;
  routeManifestIsMultiPage: boolean;
  entityCount: number;
  flowCount: number;
  targetPlatforms: string[];
  previewEntryFile: string;
  previewEntryPresent: boolean;
  previewEntryRole: FileBlueprint['role'] | null;
  preset: (typeof VISUAL_PRESETS)[keyof typeof VISUAL_PRESETS] | undefined;
  styleMeta: ReturnType<typeof getStyleDefinition> | undefined;
  artistLayer: GenerationResult['graph']['manifest']['artistLayer'];
};

const DIMENSION_ORDER: VisualQualityDimensionId[] = [
  'visual-hierarchy',
  'spacing-consistency',
  'token-style-consistency',
  'cta-prominence',
  'clutter-breathing-room',
  'mobile-fit',
  'state-completeness',
];

const PRIMARY_ACTION_PATTERN =
  /\b(?:variant\s*=\s*["'](?:default|primary)["']|type\s*=\s*["']submit["']|bg-(?:primary|blue|indigo|emerald|violet|rose|amber)-(?:500|600|700)|(?:Create|Continue|Start|Book|Buy|Submit|Save|Launch|Get started|Try now|Next step))\b/gi;
const EMPTY_STATE_PATTERN =
  /\b(?:empty state|emptyState|no results|no data|nothing here|no items|empty\b)\b/gi;
const LOADING_STATE_PATTERN =
  /\b(?:loading|isLoading|pending|skeleton|spinner)\b/gi;
const ERROR_STATE_PATTERN =
  /\b(?:error|failed|failure|retry|try again|something went wrong|alert)\b/gi;
const ICON_IMPORT_PATTERN =
  /from\s+['"]([^'"]*(?:lucide-react|@heroicons|react-icons|phosphor-react|@radix-ui\/react-icons)[^'"]*)['"]/g;
const FONT_FAMILY_PATTERN =
  /font-family\s*:\s*([^;]+);/gi;
const HEX_COLOR_PATTERN =
  /#(?:[0-9a-fA-F]{3,8})\b/g;
const ARBITRARY_COLOR_PATTERN =
  /\b(?:bg|text|border|from|to|via)-\[[^\]]+\]/g;
const VIEWPORT_HELPER_PATTERN =
  /\b(?:w-full|min-w-0|min-h-screen|overflow-x-auto|flex-wrap|max-w-[a-z0-9-]+)\b/gi;
const FIXED_WIDTH_PATTERN =
  /\b(?:w|min-w|max-w)-\[(?:8\d{2}|9\d{2}|\d{4,})px\]\b/gi;
const LARGE_GRID_PATTERN =
  /\bgrid-cols-(?:4|5|6)\b/gi;
const RESPONSIVE_PREFIX_PATTERN =
  /\b(?:sm|md|lg|xl|2xl):/g;
const TAG_PATTERN =
  /<(?:div|section|article|main|aside|nav|header|footer|button|form|input|ul|ol|li|table|tr|td|th|img|Card|Button|Tabs|Dialog|Panel|Sheet)\b/g;
const HEADING_PATTERN =
  /<(?:h1|h2|h3)\b/g;
const H1_PATTERN =
  /<h1\b/g;
const LANDMARK_PATTERN =
  /<(?:main|section|nav|aside|header|footer)\b/g;
const BUTTON_PATTERN =
  /<(?:button|Button)\b/g;
const LINK_PATTERN =
  /<(?:a|Link)\b/g;
const FORM_PATTERN =
  /<(?:form|Form)\b/g;
const SPACING_PATTERN =
  /\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-x|space-y)-(\d+(?:\.\d+)?|\[\d+(?:\.\d+)?px\])/g;

function countMatches(input: string, pattern: RegExp): number {
  const matches = input.match(pattern);
  return matches ? matches.length : 0;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function verdictForScore(score: number): VisualQualityVerdict {
  if (score >= 80) return 'strong';
  if (score >= 58) return 'acceptable';
  return 'weak';
}

function bandForScore(score: number): VisualQualityBand {
  if (score >= 80) return 'high';
  if (score >= 58) return 'medium';
  return 'low';
}

function distinctStateCoverage(signals: CollectedSignals): number {
  let count = 0;
  if (signals.emptyStateCount > 0 || signals.stateFileHints.has('empty')) count++;
  if (signals.loadingStateCount > 0 || signals.stateFileHints.has('loading')) count++;
  if (signals.errorStateCount > 0 || signals.stateFileHints.has('error')) count++;
  return count;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function uniquePush(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function collectSignals(files: FileBlueprint[], presetUnit: number): CollectedSignals {
  const signals: CollectedSignals = {
    headingCount: 0,
    h1FilesWithMultipleTitles: 0,
    landmarkCount: 0,
    buttonCount: 0,
    linkCount: 0,
    formCount: 0,
    primaryActionCount: 0,
    emptyStateCount: 0,
    loadingStateCount: 0,
    errorStateCount: 0,
    responsiveSignalCount: 0,
    viewportHelperCount: 0,
    fixedWidthCount: 0,
    tagCount: 0,
    pageTagCount: 0,
    pageLikeFileCount: 0,
    spacingValuesPx: [],
    spacingTokens: new Set<string>(),
    offScaleSpacingCount: 0,
    iconLibraries: new Set<string>(),
    fontFamilies: new Set<string>(),
    hexColors: new Set<string>(),
    arbitraryColorUsageCount: 0,
    stateFileHints: new Set<'empty' | 'loading' | 'error'>(),
  };

  files.forEach((file) => {
    const content = file.content ?? '';
    const pathLower = file.path.toLowerCase();
    const isPageLike = file.role === 'page' || file.role === 'layout' || file.role === 'entry';

    signals.headingCount += countMatches(content, HEADING_PATTERN);
    signals.landmarkCount += countMatches(content, LANDMARK_PATTERN);
    signals.buttonCount += countMatches(content, BUTTON_PATTERN);
    signals.linkCount += countMatches(content, LINK_PATTERN);
    signals.formCount += countMatches(content, FORM_PATTERN);
    signals.primaryActionCount += countMatches(content, PRIMARY_ACTION_PATTERN);
    signals.emptyStateCount += countMatches(content, EMPTY_STATE_PATTERN);
    signals.loadingStateCount += countMatches(content, LOADING_STATE_PATTERN);
    signals.errorStateCount += countMatches(content, ERROR_STATE_PATTERN);
    signals.responsiveSignalCount += countMatches(content, RESPONSIVE_PREFIX_PATTERN);
    signals.viewportHelperCount += countMatches(content, VIEWPORT_HELPER_PATTERN);
    signals.fixedWidthCount += countMatches(content, FIXED_WIDTH_PATTERN);
    signals.fixedWidthCount += countMatches(content, LARGE_GRID_PATTERN);
    signals.tagCount += countMatches(content, TAG_PATTERN);
    signals.arbitraryColorUsageCount += countMatches(content, ARBITRARY_COLOR_PATTERN);

    const h1Count = countMatches(content, H1_PATTERN);
    if (h1Count > 1) {
      signals.h1FilesWithMultipleTitles += 1;
    }

    if (isPageLike) {
      signals.pageLikeFileCount += 1;
      signals.pageTagCount += countMatches(content, TAG_PATTERN);
    }

    const iconImportMatches = content.matchAll(ICON_IMPORT_PATTERN);
    for (const match of iconImportMatches) {
      const importPath = match[1] ?? '';
      if (importPath.includes('lucide-react')) signals.iconLibraries.add('lucide-react');
      else if (importPath.includes('@heroicons')) signals.iconLibraries.add('@heroicons');
      else if (importPath.includes('react-icons')) signals.iconLibraries.add('react-icons');
      else if (importPath.includes('phosphor-react')) signals.iconLibraries.add('phosphor-react');
      else if (importPath.includes('@radix-ui/react-icons')) signals.iconLibraries.add('@radix-ui/react-icons');
    }

    const fontMatches = content.matchAll(FONT_FAMILY_PATTERN);
    for (const match of fontMatches) {
      const family = (match[1] ?? '').replace(/['"]/g, '').trim();
      if (family) signals.fontFamilies.add(family);
    }

    const hexMatches = content.match(HEX_COLOR_PATTERN) ?? [];
    hexMatches.forEach((color) => signals.hexColors.add(color.toLowerCase()));

    const spacingMatches = content.matchAll(SPACING_PATTERN);
    for (const match of spacingMatches) {
      const token = match[1];
      if (!token) continue;
      signals.spacingTokens.add(token);
      let px = 0;
      if (token.startsWith('[')) {
        px = Number.parseFloat(token.slice(1, -3));
      } else {
        px = Number.parseFloat(token) * 4;
      }
      if (!Number.isFinite(px) || px <= 0) continue;
      signals.spacingValuesPx.push(px);
      if (presetUnit > 0 && px % presetUnit !== 0) {
        signals.offScaleSpacingCount += 1;
      }
    }

    if (/(?:empty|blank)[a-z-]*\.(?:tsx|jsx|ts|js)$/.test(pathLower)) {
      signals.stateFileHints.add('empty');
    }
    if (/(?:loading|skeleton|spinner)[a-z-]*\.(?:tsx|jsx|ts|js)$/.test(pathLower)) {
      signals.stateFileHints.add('loading');
    }
    if (/(?:error|fallback|retry)[a-z-]*\.(?:tsx|jsx|ts|js)$/.test(pathLower)) {
      signals.stateFileHints.add('error');
    }
  });

  return signals;
}

function buildDimension(
  id: VisualQualityDimensionId,
  score: number,
  reasons: string[],
  evidence: VisualQualityEvidence[] = [],
  notes: string[] = [],
): VisualQualityDimensionSummary {
  return {
    id,
    verdict: verdictForScore(score),
    score: clampScore(score),
    reasons,
    evidence: evidence.length > 0 ? evidence : undefined,
    notes: notes.length > 0 ? notes : undefined,
  };
}

function isStyleId(value: string): value is StyleId {
  return value === 'dark-pro'
    || value === 'clean-light'
    || value === 'colorful-vibrant'
    || value === 'enterprise'
    || value === 'glassmorphism'
    || value === 'gamified'
    || value === 'editorial'
    || value === 'minimal-mono'
    || value === 'warm-organic'
    || value === 'futuristic';
}

function evaluateHierarchy(ctx: EvaluationContext): VisualQualityDimensionSummary {
  const reasons: string[] = [];
  const evidence: VisualQualityEvidence[] = [];
  let score = 52;

  if (ctx.artistLayer?.designDirection.hierarchyEmphasis) {
    score += 10;
    evidence.push({
      id: 'artist-hierarchy-emphasis',
      source: 'artist-layer',
      note: ctx.artistLayer.designDirection.hierarchyEmphasis,
    });
  }

  if (ctx.preset) {
    score += 8;
    evidence.push({
      id: 'preset-typography-scale',
      source: 'visual-preset',
      note: `${ctx.preset.name} defines explicit typography steps from ${ctx.preset.typography.display} to ${ctx.preset.typography.small}.`,
    });
  }

  if (ctx.routeManifestCount > 0) {
    score += 6;
    evidence.push({
      id: 'route-manifest-scope',
      source: 'route-manifest',
      note: ctx.routeManifestIsMultiPage
        ? `Route manifest declares ${ctx.routeManifestCount} screens in the visual shell.`
        : 'Route manifest declares a focused single-screen shell.',
    });
  }

  if (ctx.previewEntryPresent) {
    score += 6;
    evidence.push({
      id: 'preview-entry-target',
      source: 'preview-meta',
      note: `Preview entry resolves to ${ctx.previewEntryFile} (${ctx.previewEntryRole ?? 'unknown'}).`,
    });
  }

  if (ctx.signals.headingCount >= Math.max(1, ctx.routeCount)) {
    score += 16;
    uniquePush(reasons, 'Routed screens expose clear heading anchors.');
  } else {
    score -= 24;
    uniquePush(reasons, 'Routed screens lack a strong heading structure.');
  }

  if (ctx.signals.landmarkCount >= Math.max(1, ctx.pageFiles.length)) {
    score += 12;
    uniquePush(reasons, 'Main sections and navigation landmarks reinforce scan order.');
  } else {
    score -= 8;
  }

  if (ctx.signals.h1FilesWithMultipleTitles > 0) {
    score -= 14;
    uniquePush(reasons, 'Some screens promote multiple top-level titles at once.');
  }

  return buildDimension('visual-hierarchy', score, reasons, evidence);
}

function evaluateSpacing(ctx: EvaluationContext): VisualQualityDimensionSummary {
  const reasons: string[] = [];
  const evidence: VisualQualityEvidence[] = [];
  let score = 54;

  const presetUnit = ctx.preset?.spacing.unit ?? 4;
  const distinctSpacingCount = ctx.signals.spacingTokens.size;
  const averageSpacingPx = average(ctx.signals.spacingValuesPx);
  const density = ctx.artistLayer?.designDirection.density;
  const breathingRoom = ctx.artistLayer?.designDirection.breathingRoom;

  if (ctx.preset) {
    score += 10;
    evidence.push({
      id: 'preset-spacing-scale',
      source: 'visual-preset',
      note: `${ctx.preset.name} uses a ${presetUnit}px spacing unit.`,
    });
  }

  if (breathingRoom) {
    evidence.push({
      id: 'artist-breathing-room',
      source: 'artist-layer',
      note: `Artist layer expects ${breathingRoom} breathing room.`,
    });
  }

  if (distinctSpacingCount >= 2 && distinctSpacingCount <= 6) {
    score += 14;
    uniquePush(reasons, 'Spacing uses a tight, repeatable set of offsets.');
  } else if (distinctSpacingCount > 8) {
    score -= 22;
    uniquePush(reasons, 'Spacing jumps across too many values to feel consistent.');
  }

  if (ctx.signals.offScaleSpacingCount === 0 && ctx.signals.spacingValuesPx.length > 0) {
    score += 14;
    uniquePush(reasons, 'Spacing mostly stays on the declared token scale.');
  } else if (ctx.signals.offScaleSpacingCount > 2) {
    score -= 20;
    uniquePush(reasons, 'Several spacing values drift off the declared token scale.');
  }

  if (averageSpacingPx > 0 && density && breathingRoom) {
    if (
      (density === 'spacious' || breathingRoom === 'airy')
      && averageSpacingPx >= presetUnit * 3
    ) {
      score += 8;
    } else if (
      (density === 'spacious' || breathingRoom === 'airy')
      && averageSpacingPx < presetUnit * 2
    ) {
      score -= 12;
      uniquePush(reasons, 'The layout reads tighter than the declared airy direction.');
    }

    if (density === 'compact' && averageSpacingPx > presetUnit * 5) {
      score -= 8;
    }
  }

  return buildDimension('spacing-consistency', score, reasons, evidence);
}

function evaluateTokenConsistency(ctx: EvaluationContext): VisualQualityDimensionSummary {
  const reasons: string[] = [];
  const evidence: VisualQualityEvidence[] = [];
  let score = 53;
  const iconPolicy = ctx.artistLayer?.assetPolicy.icons;
  const fontPolicy = ctx.artistLayer?.assetPolicy.fonts;
  const previewFallback = ctx.artistLayer?.assetPolicy.previewSafeFallback;

  if (ctx.preset) {
    score += 10;
    evidence.push({
      id: 'preset-colors-radius',
      source: 'visual-preset',
      note: `${ctx.preset.name} defines one token set for colors, radius, and states.`,
    });
  }

  if (ctx.styleMeta) {
    score += 8;
    evidence.push({
      id: 'style-animation-profile',
      source: 'artist-layer',
      note: `${ctx.styleMeta.label} uses a ${ctx.styleMeta.animationProfile} motion profile.`,
    });
  }

  if ((ctx.artistLayer?.assetPolicy.icons.consistencyRules.length ?? 0) > 0) {
    score += 6;
  }

  if (iconPolicy?.preferredSource) {
    evidence.push({
      id: 'icon-source-policy',
      source: 'artist-layer',
      note: `Icon policy prefers ${iconPolicy.preferredSource}.`,
    });
  }

  if (fontPolicy?.loadingStrategy) {
    evidence.push({
      id: 'font-loading-policy',
      source: 'artist-layer',
      note: `Font policy uses ${fontPolicy.loadingStrategy}.`,
    });
  }

  if (previewFallback?.required) {
    score += 4;
    evidence.push({
      id: 'preview-safe-fallback',
      source: 'artist-layer',
      note: 'Preview-safe fallback is required, which favors a tighter token vocabulary.',
    });
  }

  if (ctx.signals.iconLibraries.size === 1) {
    score += 10;
    uniquePush(reasons, 'One icon family keeps interaction chrome visually coherent.');
    if (iconPolicy?.preferredSource && ctx.signals.iconLibraries.has(iconPolicy.preferredSource)) {
      score += 6;
      uniquePush(reasons, 'The implemented icon family matches the declared source policy.');
    }
  } else if (ctx.signals.iconLibraries.size > 1) {
    score -= 18;
    uniquePush(reasons, 'Multiple icon families make the UI language feel mixed.');
  }

  if (ctx.signals.fontFamilies.size <= 1 && ctx.signals.fontFamilies.size > 0) {
    score += 8;
    if (fontPolicy?.loadingStrategy === 'system_only' || fontPolicy?.loadingStrategy === 'local_preferred') {
      score += 4;
    }
  } else if (ctx.signals.fontFamilies.size > 2) {
    score -= 10;
    uniquePush(reasons, 'Typography drifts across too many font families.');
  }

  if (ctx.signals.hexColors.size <= 8) {
    score += 8;
  } else if (ctx.signals.hexColors.size > 12 || ctx.signals.arbitraryColorUsageCount > 8) {
    score -= 18;
    uniquePush(reasons, 'Raw color usage bypasses the preset too often.');
  }

  return buildDimension('token-style-consistency', score, reasons, evidence);
}

function evaluateCtaProminence(ctx: EvaluationContext): VisualQualityDimensionSummary {
  const reasons: string[] = [];
  const evidence: VisualQualityEvidence[] = [];
  let score = 50;

  const interactiveCount = ctx.signals.buttonCount + ctx.signals.formCount + ctx.signals.linkCount;
  const pages = Math.max(1, ctx.pageFiles.length || ctx.routeCount || 1);
  const interactivePerPage = interactiveCount / pages;

  if (ctx.artistLayer?.designDirection.ctaStrategy) {
    score += 10;
    evidence.push({
      id: 'artist-cta-strategy',
      source: 'artist-layer',
      note: ctx.artistLayer.designDirection.ctaStrategy,
    });
  }

  if (ctx.flowCount > 0 || ctx.entityCount > 0) {
    score += 6;
  }

  if (ctx.signals.primaryActionCount >= pages) {
    score += 16;
    uniquePush(reasons, 'Primary actions are discoverable on the core screens.');
  } else if (ctx.signals.buttonCount === 0 && (ctx.flowCount > 0 || ctx.routeCount > 0)) {
    score -= 24;
    uniquePush(reasons, 'Key screens expose no clear primary action.');
  } else if (ctx.signals.primaryActionCount === 0 && ctx.signals.buttonCount > 0) {
    score -= 10;
    uniquePush(reasons, 'Actions exist, but none read as the obvious primary move.');
  }

  if (interactivePerPage > 6) {
    score -= 18;
    uniquePush(reasons, 'Too many competing actions dilute the CTA hierarchy.');
  } else if (interactivePerPage >= 1 && interactivePerPage <= 4) {
    score += 8;
  }

  return buildDimension('cta-prominence', score, reasons, evidence);
}

function evaluateClutter(ctx: EvaluationContext): VisualQualityDimensionSummary {
  const reasons: string[] = [];
  const evidence: VisualQualityEvidence[] = [];
  let score = 52;

  const density = ctx.artistLayer?.designDirection.density ?? 'comfortable';
  const breathingRoom = ctx.artistLayer?.designDirection.breathingRoom ?? 'balanced';
  const pages = Math.max(1, ctx.signals.pageLikeFileCount || ctx.routeCount || 1);
  const averageTagsPerPage = ctx.signals.pageTagCount > 0 ? ctx.signals.pageTagCount / pages : 0;
  const interactivePerPage = (ctx.signals.buttonCount + ctx.signals.linkCount + ctx.signals.formCount) / pages;

  evidence.push({
    id: 'artist-density',
    source: 'artist-layer',
    note: `Density ${density}, breathing room ${breathingRoom}.`,
  });

  const denseBudget =
    density === 'compact' || breathingRoom === 'compressed' ? 125 :
    density === 'spacious' || breathingRoom === 'airy' ? 75 :
    95;

  if (averageTagsPerPage > 0 && averageTagsPerPage <= denseBudget) {
    score += 14;
    uniquePush(reasons, 'Screen composition leaves enough room for the main content blocks.');
  } else if (averageTagsPerPage > denseBudget + 35) {
    score -= 22;
    uniquePush(reasons, 'Screen composition feels overcrowded for its stated direction.');
  }

  if (interactivePerPage > 6) {
    score -= 10;
  }

  if (ctx.signals.spacingTokens.size > 8) {
    score -= 8;
  }

  return buildDimension('clutter-breathing-room', score, reasons, evidence);
}

function evaluateMobileFit(ctx: EvaluationContext): VisualQualityDimensionSummary {
  const reasons: string[] = [];
  const evidence: VisualQualityEvidence[] = [];
  let score = 54;

  const mobileSensitive =
    ctx.targetPlatforms.includes('mobile')
    || ctx.preset?.id === 'consumer-mobile'
    || Boolean(ctx.artistLayer?.designDirection.mobileComposition);

  if (ctx.artistLayer?.designDirection.mobileComposition) {
    score += 10;
    evidence.push({
      id: 'artist-mobile-composition',
      source: 'artist-layer',
      note: ctx.artistLayer.designDirection.mobileComposition,
    });
  }

  if (ctx.preset) {
    evidence.push({
      id: 'preset-layout-shell',
      source: 'visual-preset',
      note: `${ctx.preset.name} uses ${ctx.preset.layout.pattern} with ${ctx.preset.layout.contentPad} content padding.`,
    });
  }

  if (ctx.previewEntryPresent) {
    evidence.push({
      id: 'preview-entry-mobile-scope',
      source: 'preview-meta',
      note: `Mobile-fit checks are anchored to preview entry ${ctx.previewEntryFile}.`,
    });
  }

  if (ctx.routeManifestCount > 0) {
    evidence.push({
      id: 'route-manifest-mobile-scope',
      source: 'route-manifest',
      note: ctx.routeManifestIsMultiPage
        ? `Viewport discipline must hold across ${ctx.routeManifestCount} routed screens.`
        : 'Viewport discipline is evaluated on a single routed screen.',
    });
  }

  if (ctx.signals.responsiveSignalCount >= Math.max(2, ctx.pageFiles.length)) {
    score += 16;
    uniquePush(reasons, 'Responsive layout signals are present on the main screens.');
  } else if (mobileSensitive) {
    score -= 18;
    uniquePush(reasons, 'Viewport handling is too thin for the declared mobile composition.');
  }

  if (mobileSensitive && ctx.routeManifestIsMultiPage && ctx.signals.responsiveSignalCount < ctx.routeManifestCount) {
    score -= 10;
    uniquePush(reasons, 'Multi-screen mobile routes need more consistent responsive rules.');
  }

  if (ctx.signals.viewportHelperCount > 0) {
    score += 6;
  }

  if (ctx.signals.fixedWidthCount > 0) {
    score -= 26;
    uniquePush(reasons, 'Fixed-width layout decisions will fight smaller viewports.');
  }

  return buildDimension('mobile-fit', score, reasons, evidence);
}

function evaluateStateCompleteness(ctx: EvaluationContext): VisualQualityDimensionSummary {
  const reasons: string[] = [];
  const evidence: VisualQualityEvidence[] = [];
  let score = 48;

  const stateCoverage = distinctStateCoverage(ctx.signals);
  const declaredScope = ctx.artistLayer?.redesignIntent.screensInScope.length ?? 0;
  const complexity = ctx.routeCount + ctx.entityCount + ctx.flowCount + declaredScope;

  if (ctx.preset) {
    score += 10;
    evidence.push({
      id: 'preset-state-styles',
      source: 'visual-preset',
      note: `${ctx.preset.name} defines empty, loading, and error treatment.`,
    });
  }

  if (ctx.routeManifestCount > 0) {
    evidence.push({
      id: 'route-manifest-state-scope',
      source: 'route-manifest',
      note: ctx.routeManifestIsMultiPage
        ? `State coverage is expected across ${ctx.routeManifestCount} routed screens.`
        : 'State coverage is expected on the main routed screen.',
    });
  }

  if (ctx.previewEntryPresent) {
    evidence.push({
      id: 'preview-entry-state-scope',
      source: 'preview-meta',
      note: `State checks are anchored to preview entry ${ctx.previewEntryFile}.`,
    });
  }

  if (stateCoverage === 3) {
    score += 28;
    uniquePush(reasons, 'Empty, loading, and error states all have explicit treatment.');
  } else if (stateCoverage === 2) {
    score += 10;
    uniquePush(reasons, 'Most core states are accounted for, but one treatment is still thin.');
  } else if (stateCoverage === 1) {
    score -= 12;
    uniquePush(reasons, 'Only one fallback state is visible across the routed UI.');
  } else {
    score -= 28;
    uniquePush(reasons, 'Empty, loading, and error states are largely missing.');
  }

  if (complexity >= 3 && stateCoverage < 3) {
    score -= 10;
  }

  return buildDimension('state-completeness', score, reasons, evidence);
}

function summarizeReasons(
  verdict: VisualQualityVerdict,
  dimensions: VisualQualityDimensionSummary[],
): string[] {
  const ordered =
    verdict === 'strong'
      ? [...dimensions].sort((a, b) => b.score - a.score)
      : verdict === 'weak'
        ? [...dimensions].sort((a, b) => a.score - b.score)
        : [...dimensions].sort(
            (a, b) => Math.abs(b.score - 65) - Math.abs(a.score - 65),
          );

  const summary: string[] = [];
  ordered.forEach((dimension) => {
    dimension.reasons.forEach((reason) => {
      if (summary.length < 5) uniquePush(summary, reason);
    });
  });

  if (summary.length < 3) {
    [...dimensions].forEach((dimension) => {
      if (summary.length >= 3) return;
      const fallback =
        dimension.verdict === 'strong'
          ? `${dimension.id} reads intentionally strong.`
          : dimension.verdict === 'acceptable'
            ? `${dimension.id} is workable but not fully resolved.`
            : `${dimension.id} needs attention.`;
      uniquePush(summary, fallback);
    });
  }

  return summary.slice(0, 5);
}

export const VisualQualityService = {
  evaluate(result: GenerationResult): VisualQualitySummary {
    const manifest = result.graph.manifest;
    const artistLayer = manifest.artistLayer;
    const preset = manifest.visualPreset ? VISUAL_PRESETS[manifest.visualPreset] : undefined;
    const styleMeta =
      artistLayer && isStyleId(artistLayer.classification.style)
        ? getStyleDefinition(artistLayer.classification.style)
        : undefined;
    const pageFiles = result.graph.files.filter((file) => file.role === 'page');
    const routeManifestCount = result.changePackage.routeManifest.routes.length;
    const routeCount = routeManifestCount || result.graph.routes.length;
    const entityCount = manifest.mainEntities?.length ?? 0;
    const flowCount = manifest.keyFlows?.length ?? 0;
    const previewEntryFile = result.changePackage.previewMeta.entryFile ?? '';
    const previewEntry = result.graph.files.find((file) => file.path === previewEntryFile) ?? null;
    const signals = collectSignals(result.graph.files, preset?.spacing.unit ?? 4);

    const ctx: EvaluationContext = {
      signals,
      pageFiles,
      routeCount,
      routeManifestCount,
      routeManifestIsMultiPage: result.changePackage.routeManifest.isMultiPage ?? routeCount > 1,
      entityCount,
      flowCount,
      targetPlatforms: manifest.targetPlatforms,
      previewEntryFile,
      previewEntryPresent: Boolean(previewEntry),
      previewEntryRole: previewEntry?.role ?? null,
      preset,
      styleMeta,
      artistLayer,
    };

    const dimensions = [
      evaluateHierarchy(ctx),
      evaluateSpacing(ctx),
      evaluateTokenConsistency(ctx),
      evaluateCtaProminence(ctx),
      evaluateClutter(ctx),
      evaluateMobileFit(ctx),
      evaluateStateCompleteness(ctx),
    ].sort(
      (a, b) => DIMENSION_ORDER.indexOf(a.id) - DIMENSION_ORDER.indexOf(b.id),
    );

    const score = clampScore(
      dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length,
    );
    const weakCount = dimensions.filter((dimension) => dimension.verdict === 'weak').length;
    const strongCount = dimensions.filter((dimension) => dimension.verdict === 'strong').length;

    const verdict: VisualQualityVerdict =
      score >= 80 && weakCount === 0 && strongCount >= 4
        ? 'strong'
        : score < 58 || weakCount >= 3
          ? 'weak'
          : 'acceptable';

    const notes: string[] = [];
    if (!artistLayer) {
      notes.push('Artist-layer guidance was absent; visual quality leaned more on graph and file-structure signals.');
    }
    if (!preset) {
      notes.push('Visual preset metadata was absent; token and spacing consistency used lightweight heuristics.');
    }

    return {
      verdict,
      band: bandForScore(score),
      score,
      dimensions,
      reasons: summarizeReasons(verdict, dimensions),
      evidence: (() => {
        const collected = dimensions.flatMap((dimension) => dimension.evidence ?? []).slice(0, 8);
        return collected.length > 0 ? collected : undefined;
      })(),
      notes: notes.length > 0 ? notes : undefined,
    };
  },
};
