import type {
  ArtistLayerSpec,
  AssetSourcePolicy,
  DesignDirection,
  RedesignIntent,
  RedesignMode,
} from '../../shared/projectModel';
import { CATEGORIES, type CategoryId, type StyleId } from './categories';
import type { ClassificationResult } from './classifier';
import { STYLES } from './styles';

type PlanScreen = {
  name?: string;
  path?: string;
  purpose?: string;
  showInNav?: boolean;
};

interface ArtistLayerInput {
  idea: string;
  classification?: ClassificationResult;
  pages?: PlanScreen[];
  existingFileCount?: number;
  appName?: string;
  currentTheme?: string;
  redesignIntentOverride?: Partial<RedesignIntent>;
  preferredArtistLayer?: ArtistLayerPreference | ArtistLayerSpec | null;
}

export interface ArtistLayerPreference {
  version?: ArtistLayerSpec['version'];
  classification?: Partial<ArtistLayerSpec['classification']>;
  designDirection?: Partial<ArtistLayerSpec['designDirection']>;
  redesignIntent?: Partial<ArtistLayerSpec['redesignIntent']>;
  assetPolicy?: {
    components?: Partial<ArtistLayerSpec['assetPolicy']['components']>;
    icons?: Partial<ArtistLayerSpec['assetPolicy']['icons']>;
    media?: Partial<ArtistLayerSpec['assetPolicy']['media']>;
    fonts?: Partial<ArtistLayerSpec['assetPolicy']['fonts']>;
    advancedResources?: Partial<ArtistLayerSpec['assetPolicy']['advancedResources']>;
    previewSafeFallback?: Partial<ArtistLayerSpec['assetPolicy']['previewSafeFallback']>;
  };
}

type CategoryFamily =
  | 'operator'
  | 'editorial'
  | 'commerce'
  | 'community'
  | 'wellness'
  | 'playful'
  | 'utility';

function inferCategoryFamily(category: CategoryId): CategoryFamily {
  if ([
    'saas-dashboard',
    'crm-sales',
    'project-management',
    'hr-recruiting',
    'analytics-bi',
    'devtools',
    'banking-fintech',
    'investment-crypto',
    'legal-compliance',
    'construction-realty',
    'logistics-delivery',
    'gov-civic',
    'b2b-marketplace',
  ].includes(category)) return 'operator';

  if ([
    'newsletter-blog',
    'portfolio-showcase',
    'note-taking',
    'travel-experiences',
    'real-estate',
    'creator-tools',
  ].includes(category)) return 'editorial';

  if ([
    'ecommerce-store',
    'marketplace',
    'booking-service',
    'restaurant-food',
    'events-ticketing',
  ].includes(category)) return 'commerce';

  if ([
    'social-network',
    'chat-messaging',
    'community-forum',
    'dating-social',
    'media-streaming',
    'talent-freelance',
  ].includes(category)) return 'community';

  if ([
    'fitness-workout',
    'nutrition-diet',
    'mental-health',
    'medical-health',
    'habit-tracker',
    'agriculture-farm',
    'ngo-nonprofit',
  ].includes(category)) return 'wellness';

  if ([
    'language-learning',
    'kids-education',
    'e-learning',
    'ai-assistant',
    'ai-content',
    'ai-analytics',
    'ai-automation',
  ].includes(category)) return 'playful';

  return 'utility';
}

function inferRedesignMode(input: ArtistLayerInput): RedesignMode {
  const text = input.idea.toLowerCase();
  if (input.redesignIntentOverride?.mode) return input.redesignIntentOverride.mode;
  if ((input.existingFileCount ?? 0) === 0) return 'preserve';
  if (/(full redesign|rebuild|start over|overhaul|new structure|new navigation|new ia|re-architect)/i.test(text)) {
    return 'full_redesign';
  }
  if (/(full retheme|retheme|visual reset|brand reset|new visual system|reskin the whole app)/i.test(text)) {
    return 'full_retheme';
  }
  if (/(redesign .*page|redesign .*screen|rework .*page|rework .*screen|landing page redesign|dashboard redesign|home redesign)/i.test(text)) {
    return 'page_redesign';
  }
  if (/(restyle|visual refresh|refresh the ui|polish the ui|modernize the ui|make it look)/i.test(text)) {
    return 'partial_restyle';
  }
  return 'preserve';
}

function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && value in CATEGORIES;
}

function isStyleId(value: unknown): value is StyleId {
  return typeof value === 'string' && value in STYLES;
}

function getSafeClassification(input: ArtistLayerInput): ClassificationResult {
  const preferred = input.preferredArtistLayer?.classification;
  if (preferred && isCategoryId(preferred.category) && isStyleId(preferred.style)) {
    return {
      category: preferred.category,
      style: preferred.style,
      confidence: typeof preferred.confidence === 'number' ? preferred.confidence : 0.8,
      reasoning: typeof preferred.reasoning === 'string' && preferred.reasoning.trim()
        ? preferred.reasoning
        : 'Reused from existing artist layer',
    };
  }

  if (input.classification) {
    return input.classification;
  }

  return {
    category: 'task-manager',
    style: 'clean-light',
    confidence: 0.3,
    reasoning: 'Fallback default classification',
  };
}

function inferScreensInScope(
  idea: string,
  pages: PlanScreen[],
  mode: RedesignMode,
): string[] {
  const normalizedIdea = idea.toLowerCase();
  const matched = pages
    .filter((page) => {
      const name = page.name?.toLowerCase() ?? '';
      const path = page.path?.toLowerCase() ?? '';
      return Boolean(name && normalizedIdea.includes(name))
        || Boolean(path && path !== '/' && normalizedIdea.includes(path.replace('/', '')));
    })
    .map((page) => page.name ?? page.path ?? 'Screen');

  if (matched.length > 0) return matched;
  if (mode === 'page_redesign') {
    const firstNonRoot = pages.find((page) => page.path && page.path !== '/');
    return [firstNonRoot?.name ?? pages[0]?.name ?? 'Primary Screen'];
  }
  if (mode === 'preserve' || mode === 'partial_restyle') {
    return pages.filter((page) => page.showInNav !== false).map((page) => page.name ?? page.path ?? 'Screen');
  }
  return pages.map((page) => page.name ?? page.path ?? 'Screen');
}

function inferBrandAnchors(
  input: ArtistLayerInput,
  mode: RedesignMode,
  screensInScope: string[],
): string[] {
  const anchors = new Set<string>();
  if (input.appName) anchors.add(`${input.appName} naming and product promise`);
  if (input.currentTheme) anchors.add(`existing ${input.currentTheme} theme expectations`);
  if (screensInScope.length > 0 && (mode === 'preserve' || mode === 'partial_restyle' || mode === 'page_redesign')) {
    anchors.add(`current navigation labels for ${screensInScope.slice(0, 3).join(', ')}`);
  }
  if (mode === 'preserve' || mode === 'partial_restyle') {
    anchors.add('existing information architecture');
    anchors.add('recognizable brand accents and tone');
  }
  return [...anchors];
}

function buildRedesignIntent(input: ArtistLayerInput): RedesignIntent {
  const mode = inferRedesignMode(input);
  const pages = input.pages ?? [];
  const screensInScope = inferScreensInScope(input.idea, pages, mode);
  const brandAnchorsToPreserve = inferBrandAnchors(input, mode, screensInScope);
  const greenfield = (input.existingFileCount ?? 0) === 0;

  const base: RedesignIntent = {
    mode,
    structureLock:
      mode === 'preserve' || mode === 'partial_restyle'
        ? 'strict'
        : mode === 'page_redesign' || mode === 'full_retheme'
        ? 'prefer'
        : 'flexible',
    brandAnchorsToPreserve,
    screensInScope,
    visualSystemReset: mode === 'full_retheme' || mode === 'full_redesign',
    changeEnvelope:
      greenfield
        ? 'greenfield_foundation'
        : mode === 'preserve' || mode === 'partial_restyle'
        ? 'visual_refresh_without_structural_change'
        : mode === 'page_redesign'
        ? 'scoped_redesign'
        : mode === 'full_retheme'
        ? 'full_visual_reset'
        : 'structural_redesign',
    structureChangeAllowed: mode === 'full_redesign',
    inspectionNotes:
      greenfield
        ? ['No existing generated UI detected; treat this as a greenfield artist-layer foundation.']
        : mode === 'preserve'
        ? ['Preserve structure and brand recognition; changes should read as refinement, not reinvention.']
        : mode === 'partial_restyle'
        ? ['Visual refresh only; keep layout, routing, and information hierarchy stable.']
        : mode === 'page_redesign'
        ? ['Redesign only the screens in scope; avoid collateral navigation or IA changes.']
        : mode === 'full_retheme'
        ? ['Reset the visual system across the product while keeping the product structure mostly recognizable.']
        : ['Full redesign may change structure, navigation, and page choreography.'],
  };

  return {
    ...base,
    ...input.redesignIntentOverride,
    brandAnchorsToPreserve: input.redesignIntentOverride?.brandAnchorsToPreserve ?? base.brandAnchorsToPreserve,
    screensInScope: input.redesignIntentOverride?.screensInScope ?? base.screensInScope,
    inspectionNotes: input.redesignIntentOverride?.inspectionNotes ?? base.inspectionNotes,
  };
}

function motionStrategyFor(styleId: StyleId, family: CategoryFamily): string {
  const animationProfile = STYLES[styleId].animationProfile;
  if (animationProfile === 'none') {
    return family === 'operator'
      ? 'Keep motion minimal: state changes, focus rings, and structural transitions only.'
      : 'Use almost no decorative motion; reserve animation for orientation and feedback.';
  }
  if (animationProfile === 'subtle') {
    return 'Use subtle fades, hover lifts, and state transitions that make the interface feel intentional without stealing attention.';
  }
  if (animationProfile === 'moderate') {
    return 'Use staged entrances, clear modal transitions, and gentle parallax or blur shifts where they reinforce hierarchy.';
  }
  return 'Use expressive motion for celebration, emphasis, and spatial continuity, but keep primary workflows readable and performant.';
}

function buildDesignDirection(input: ArtistLayerInput, redesignIntent: RedesignIntent): DesignDirection {
  const classification = getSafeClassification(input);
  const categoryMeta = CATEGORIES[classification.category];
  const styleMeta = STYLES[classification.style];
  const family = inferCategoryFamily(classification.category);

  const familyDirection: Record<CategoryFamily, DesignDirection> = {
    operator: {
      visualArchetype: 'operator cockpit',
      density: 'compact',
      breathingRoom: 'compressed',
      shellStyle: 'Persistent workspace shell with strong navigation, utility header, and decision-focused content zones.',
      hierarchyEmphasis: 'Lead with active KPIs, queues, and next actions before secondary storytelling.',
      contentRhythm: 'Alternating metric cards, list-detail panels, and dense table or timeline sections.',
      ctaStrategy: 'One authoritative primary action per screen with utility actions nearby but visually quieter.',
      imageryStrategy: 'Favor product states, charts, status chips, and diagrams over decorative photography.',
      motionStrategy: motionStrategyFor(classification.style, family),
      mobileComposition: 'Collapse to one dominant column, preserve the primary action above the fold, and move navigation into bottom tabs or a drawer.',
      avoidConstraints: [
        'Do not let decorative hero art hide operational data.',
        'Avoid oversized card chrome that reduces scan speed.',
        'Avoid mixing multiple competing accent systems on one screen.',
      ],
      rationale: [
        `Category ${categoryMeta.label} benefits from high signal density and decisive task framing.`,
        `Style ${styleMeta.label} should reinforce clarity rather than novelty.`,
      ],
    },
    editorial: {
      visualArchetype: 'editorial storytelling canvas',
      density: 'spacious',
      breathingRoom: 'airy',
      shellStyle: 'Narrative shell with restrained navigation, long-form sections, and clear feature pacing.',
      hierarchyEmphasis: 'Lead with a strong headline or hero frame, then unfold supporting modules with deliberate whitespace.',
      contentRhythm: 'Long-form sections, asymmetrical cards, and alternating feature modules with occasional full-bleed moments.',
      ctaStrategy: 'Use fewer, better CTAs tied to trust or conversion moments instead of constant repeated buttons.',
      imageryStrategy: 'Use high-weight editorial imagery, product mockups, or creator visuals where they meaningfully carry the story.',
      motionStrategy: motionStrategyFor(classification.style, family),
      mobileComposition: 'Keep a single reading column, compress navigation, and preserve a clean content stack with one sticky conversion action.',
      avoidConstraints: [
        'Avoid dashboard-style clutter and repetitive equal-weight cards.',
        'Do not turn narrative sections into generic marketing blocks.',
        'Avoid decorative color noise that fights typography.',
      ],
      rationale: [
        `Category ${categoryMeta.label} needs a stronger point of view and content hierarchy.`,
        `Style ${styleMeta.label} should make typography and imagery feel intentional.`,
      ],
    },
    commerce: {
      visualArchetype: 'showroom conversion surface',
      density: 'comfortable',
      breathingRoom: 'balanced',
      shellStyle: 'Conversion-led shell with merchandising modules, trust rails, and comparison-ready product surfaces.',
      hierarchyEmphasis: 'Lead with product promise, social proof, and a clear route to selection or booking.',
      contentRhythm: 'Hero or category lead-ins followed by card grids, comparison rows, and sticky purchase moments.',
      ctaStrategy: 'Keep a persistent conversion path: browse, compare, and commit with clear primary and reassurance secondary actions.',
      imageryStrategy: 'Use product, place, or food imagery only where realism boosts confidence; otherwise use clean merchandising placeholders.',
      motionStrategy: motionStrategyFor(classification.style, family),
      mobileComposition: 'Prioritize thumb-friendly filters, sticky buy or book actions, and concise card stacks before denser comparison sections.',
      avoidConstraints: [
        'Avoid burying the buy or book action below non-essential decoration.',
        'Do not mix too many card templates in one journey.',
        'Avoid remote media when it weakens preview-safe clarity.',
      ],
      rationale: [
        `Category ${categoryMeta.label} depends on trust and conversion more than pure novelty.`,
        `Style ${styleMeta.label} should sharpen merchandising rather than distract from it.`,
      ],
    },
    community: {
      visualArchetype: 'activity stream social shell',
      density: 'comfortable',
      breathingRoom: 'balanced',
      shellStyle: 'Feed-oriented shell with recurring engagement anchors, identity cues, and quick posting or response affordances.',
      hierarchyEmphasis: 'Lead with live activity, identity cues, and one dominant engagement action per view.',
      contentRhythm: 'Alternating feed cards, response threads, and lightweight side modules for trends, members, or context.',
      ctaStrategy: 'Make contribution frictionless: one clear create, reply, or connect action at every major state.',
      imageryStrategy: 'Use avatars, creator surfaces, and contextual media carefully; avoid stock-photo overload.',
      motionStrategy: motionStrategyFor(classification.style, family),
      mobileComposition: 'Keep composition stacked, make composer and engagement actions easy to reach, and trim secondary context into drawers or sheets.',
      avoidConstraints: [
        'Avoid heavy enterprise chrome that makes the product feel inert.',
        'Do not let decorative media compete with conversation flow.',
        'Avoid too many simultaneously highlighted actions in feed items.',
      ],
      rationale: [
        `Category ${categoryMeta.label} should feel alive, social, and responsive.`,
        `Style ${styleMeta.label} should support participation, not just presentation.`,
      ],
    },
    wellness: {
      visualArchetype: 'calm guided coaching space',
      density: 'spacious',
      breathingRoom: 'airy',
      shellStyle: 'Soft guidance shell with clear progress anchors, reassuring surfaces, and low-stress navigation.',
      hierarchyEmphasis: 'Lead with current state, progress, and the next supportive step rather than with dense controls.',
      contentRhythm: 'Breathing sections, rounded cards, and one primary ritual or progress module per viewport.',
      ctaStrategy: 'Frame CTAs as next supportive steps, check-ins, or rituals rather than aggressive conversion pushes.',
      imageryStrategy: 'Use warm, human imagery or gentle abstraction only where it improves empathy and trust.',
      motionStrategy: motionStrategyFor(classification.style, family),
      mobileComposition: 'Favor single-column flows, comfortable spacing, sticky progress or action anchors, and reduced decision load per screen.',
      avoidConstraints: [
        'Avoid cold enterprise density and overly technical UI language.',
        'Do not over-animate moments that should feel calm and safe.',
        'Avoid harsh contrast combinations that feel clinical unless the domain requires it.',
      ],
      rationale: [
        `Category ${categoryMeta.label} should feel supportive and emotionally safe.`,
        `Style ${styleMeta.label} should preserve calm while keeping the interface useful.`,
      ],
    },
    playful: {
      visualArchetype: 'guided playful experience',
      density: 'comfortable',
      breathingRoom: 'balanced',
      shellStyle: 'Progress-led shell with strong milestones, visual rewards, and clear next-step affordances.',
      hierarchyEmphasis: 'Lead with the current challenge or outcome, then show progress, rewards, or supporting detail.',
      contentRhythm: 'Modular cards, milestone moments, and alternating progress surfaces with active learning or creation zones.',
      ctaStrategy: 'Use action-first CTA language with one main progression step and optional exploratory branches.',
      imageryStrategy: 'Favor lightweight illustration, product examples, or creator-led visuals instead of generic stock imagery.',
      motionStrategy: motionStrategyFor(classification.style, family),
      mobileComposition: 'Keep flows linear, use clear progress anchors, and keep rewards or feedback visible without crowding the task.',
      avoidConstraints: [
        'Avoid turning the experience into a generic enterprise dashboard.',
        'Do not stack too many competing reward systems at once.',
        'Avoid noisy gradients when the learning or creation task needs concentration.',
      ],
      rationale: [
        `Category ${categoryMeta.label} benefits from progression and feedback loops.`,
        `Style ${styleMeta.label} should create energy without random chaos.`,
      ],
    },
    utility: {
      visualArchetype: 'focused utility shell',
      density: 'comfortable',
      breathingRoom: 'balanced',
      shellStyle: 'Lean product shell with direct task framing, limited navigation, and highly legible work surfaces.',
      hierarchyEmphasis: 'Lead with the task and result, not with decorative scene-setting.',
      contentRhythm: 'Compact sections, clear labels, and repeated component logic that supports fast comprehension.',
      ctaStrategy: 'Keep one obvious primary action and reduce secondary clutter.',
      imageryStrategy: 'Use imagery sparingly; prefer diagrams, icons, or self-contained visual accents.',
      motionStrategy: motionStrategyFor(classification.style, family),
      mobileComposition: 'Use one dominant column, progressive disclosure for settings, and sticky submission or apply actions.',
      avoidConstraints: [
        'Avoid unnecessary marketing chrome around core tasks.',
        'Do not introduce multiple visual metaphors on one screen.',
        'Avoid ornamental motion that slows repeat use.',
      ],
      rationale: [
        `Category ${categoryMeta.label} should optimize for direct utility and repeatability.`,
        `Style ${styleMeta.label} should add character without obscuring function.`,
      ],
    },
  };

  const base = familyDirection[family];

  if (classification.style === 'editorial') {
    return {
      ...base,
      hierarchyEmphasis: 'Let typography and content framing carry the first impression before UI chrome.',
      imageryStrategy: `${base.imageryStrategy} Prioritize image crops and headline rhythm over decorative badges.`,
      avoidConstraints: [...base.avoidConstraints, 'Avoid cramped spacing that makes the interface feel templated.'],
    };
  }

  if (classification.style === 'enterprise') {
    return {
      ...base,
      density: 'compact',
      breathingRoom: 'compressed',
      shellStyle: 'Structured enterprise shell with explicit nav, utility rails, and strong operational grouping.',
      ctaStrategy: 'Use conservative but unmistakable primary actions with trust-building secondary labels.',
      avoidConstraints: [...base.avoidConstraints, 'Avoid playful embellishments that undermine trust or auditability.'],
    };
  }

  if (classification.style === 'glassmorphism' || classification.style === 'futuristic') {
    return {
      ...base,
      shellStyle: 'Layered shell with atmospheric depth, selective translucency, and clearly separated interaction planes.',
      imageryStrategy: `${base.imageryStrategy} Any atmospheric effects should remain secondary to legibility.`,
      avoidConstraints: [...base.avoidConstraints, 'Do not let glow, blur, or transparency reduce readability or hierarchy.'],
    };
  }

  if (classification.style === 'gamified' || classification.style === 'colorful-vibrant') {
    return {
      ...base,
      ctaStrategy: 'Use clear action verbs, visible progress, and occasional celebration moments anchored to meaningful user wins.',
      contentRhythm: `${base.contentRhythm} Let color changes reinforce task states and progression.`,
      avoidConstraints: [...base.avoidConstraints, 'Avoid novelty visuals that are not tied to an action, state, or reward.'],
    };
  }

  if (redesignIntent.mode === 'partial_restyle' || redesignIntent.mode === 'preserve') {
    return {
      ...base,
      shellStyle: `${base.shellStyle} Preserve the recognizable page scaffolding while refreshing visual expression.`,
    };
  }

  if (redesignIntent.mode === 'full_redesign') {
    return {
      ...base,
      shellStyle: `${base.shellStyle} Structural re-composition is allowed if it improves clarity and flow.`,
      mobileComposition: `${base.mobileComposition} Rework screen order if needed to create a stronger mobile-first narrative.`,
    };
  }

  return base;
}

function buildAssetPolicy(
  input: ArtistLayerInput,
  designDirection: DesignDirection,
  redesignIntent: RedesignIntent,
): AssetSourcePolicy {
  const classification = getSafeClassification(input);
  const realismDrivenCategories = new Set<CategoryId>([
    'travel-experiences',
    'real-estate',
    'restaurant-food',
    'ecommerce-store',
    'portfolio-showcase',
    'newsletter-blog',
    'creator-tools',
    'events-ticketing',
    'booking-service',
  ]);

  const remoteMedia =
    redesignIntent.changeEnvelope === 'greenfield_foundation'
    && realismDrivenCategories.has(classification.category)
      ? 'allow'
      : realismDrivenCategories.has(classification.category)
      ? 'prefer_fallback'
      : 'avoid';

  const fontStrategy =
    classification.style === 'editorial'
      ? 'remote_allowed'
      : classification.style === 'minimal-mono' || classification.style === 'enterprise'
      ? 'system_only'
      : 'local_preferred';

  return {
    components: {
      allowedSources: ['shadcn/ui primitives', 'studio block components', 'project-local composed components'],
      preferredSources: ['shadcn/ui primitives', 'studio block components'],
      remoteComponentPolicy: 'disallow',
      consistencyRules: [
        'Use one component vocabulary across the product and compose from approved primitives.',
        'Do not mix unrelated third-party component kits in the same implementation.',
        'If a custom component is needed, build it on top of the approved primitives instead of replacing them.',
      ],
      fallbackPolicy: 'Fallback to shadcn/ui primitives plus local layout wrappers only.',
    },
    icons: {
      allowedSources: ['lucide-react', 'local inline SVG for brand marks only'],
      preferredSource: 'lucide-react',
      consistencyRules: [
        'Use one icon family for all app chrome and interaction states.',
        'Reserve bespoke SVG only for logos or category art, not for general UI actions.',
      ],
      fallbackPolicy: 'Fallback to lucide-react only.',
    },
    media: {
      remoteAssetPolicy: remoteMedia,
      allowedSources:
        remoteMedia === 'allow'
          ? ['source.unsplash.com keyword photography', 'i.pravatar.cc avatars', 'self-contained gradients or inline SVG fallback']
          : remoteMedia === 'prefer_fallback'
          ? ['self-contained gradients', 'inline SVG illustrations', 'i.pravatar.cc avatars if identity matters', 'source.unsplash.com only when realism is critical']
          : ['self-contained gradients', 'inline SVG illustrations', 'abstract shapes', 'emoji accents'],
      consistencyRules: [
        'If remote photography is used, keep the UI legible without it and preserve a self-contained fallback.',
        'Do not mix many unrelated image styles on one screen.',
        'Use imagery to reinforce trust, story, or product realism, not as filler.',
      ],
      fallbackPolicy:
        remoteMedia === 'allow'
          ? 'When remote assets fail or feel noisy, degrade to gradients, inline SVG, or framed media placeholders that keep layout rhythm intact.'
          : 'Default to self-contained gradients, illustrations, or shaped placeholders so the preview remains stable and coherent.',
      rationale:
        remoteMedia === 'allow'
          ? `${designDirection.visualArchetype} benefits from realism, but preview-safe fallback remains mandatory.`
          : 'Preview-safe output and visual consistency outweigh remote-media realism for this product direction.',
    },
    fonts: {
      loadingStrategy: fontStrategy,
      allowedSources:
        fontStrategy === 'remote_allowed'
          ? ['safe remote webfont with fallback stack', 'system serif or sans fallback', 'local CSS variable token mapping']
          : fontStrategy === 'system_only'
          ? ['system font stack', 'existing local CSS token fonts']
          : ['existing local CSS token fonts', 'system font stack', 'safe optional remote fallback'],
      fallbackFamilies:
        classification.style === 'editorial'
          ? ['Georgia', 'Times New Roman', 'serif']
          : classification.style === 'minimal-mono'
          ? ['ui-monospace', 'SFMono-Regular', 'monospace']
          : ['Inter', 'system-ui', 'sans-serif'],
      rationale:
        fontStrategy === 'remote_allowed'
          ? 'Remote fonts are allowed only when typography is central to the concept and the layout remains stable with fallbacks.'
          : fontStrategy === 'system_only'
          ? 'Keep fonts system-safe for predictability, performance, and preview stability.'
          : 'Prefer local or system-safe typography; remote loading is secondary and must not define layout integrity.',
    },
    advancedResources: {
      allowedSources: ['CSS gradients', 'inline SVG patterns', 'data URI textures', 'Framer Motion', 'local illustration wrappers'],
      remoteAssetPolicy: remoteMedia === 'allow' ? 'case_by_case' : 'avoid',
      consistencyRules: [
        'Use advanced effects only when they reinforce the chosen archetype and hierarchy.',
        'Keep atmospheric layers behind content and interaction surfaces.',
        'Avoid mixing multiple high-drama visual effects in the same viewport.',
      ],
      fallbackPolicy: 'Fallback to CSS-only gradients, shadows, and inline SVG patterns that remain self-contained.',
    },
    previewSafeFallback: {
      required: true,
      componentStrategy: 'Always degrade to approved local components and shadcn/ui primitives.',
      mediaStrategy: 'Maintain self-contained gradients, patterns, or framed placeholders when remote media is avoided or unavailable.',
      fontStrategy: 'Every font choice must have a stable system or local fallback stack.',
      iconStrategy: 'Lucide remains the safe fallback icon system for all generic UI actions.',
    },
  };
}

export function buildArtistLayer(input: ArtistLayerInput): ArtistLayerSpec {
  const classification = getSafeClassification(input);
  const redesignIntent = buildRedesignIntent(input);
  const designDirection = buildDesignDirection(input, redesignIntent);
  const assetPolicy = buildAssetPolicy(input, designDirection, redesignIntent);

  return {
    version: 1,
    classification: {
      category: classification.category,
      style: classification.style,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
    },
    designDirection,
    redesignIntent,
    assetPolicy,
  };
}

export function hasMeaningfulArtistLayer(value: unknown): value is ArtistLayerSpec {
  const candidate = value as Partial<ArtistLayerSpec> | null | undefined;
  return Boolean(
    candidate
    && candidate.designDirection?.visualArchetype
    && candidate.redesignIntent?.mode
    && candidate.assetPolicy?.components?.allowedSources?.length
  );
}

export function mergeArtistLayer(
  base: ArtistLayerSpec,
  preferred?: ArtistLayerPreference | ArtistLayerSpec | null,
): ArtistLayerSpec {
  if (!preferred) return base;

  return {
    ...base,
    ...preferred,
    classification: {
      ...base.classification,
      ...(preferred.classification ?? {}),
    },
    designDirection: {
      ...base.designDirection,
      ...(preferred.designDirection ?? {}),
    },
    redesignIntent: {
      ...base.redesignIntent,
      ...(preferred.redesignIntent ?? {}),
    },
    assetPolicy: {
      ...base.assetPolicy,
      ...(preferred.assetPolicy ?? {}),
      components: {
        ...base.assetPolicy.components,
        ...(preferred.assetPolicy?.components ?? {}),
      },
      icons: {
        ...base.assetPolicy.icons,
        ...(preferred.assetPolicy?.icons ?? {}),
      },
      media: {
        ...base.assetPolicy.media,
        ...(preferred.assetPolicy?.media ?? {}),
      },
      fonts: {
        ...base.assetPolicy.fonts,
        ...(preferred.assetPolicy?.fonts ?? {}),
      },
      advancedResources: {
        ...base.assetPolicy.advancedResources,
        ...(preferred.assetPolicy?.advancedResources ?? {}),
      },
      previewSafeFallback: {
        ...base.assetPolicy.previewSafeFallback,
        ...(preferred.assetPolicy?.previewSafeFallback ?? {}),
      },
    },
  };
}

export function resolveArtistLayer(input: ArtistLayerInput): ArtistLayerSpec {
  const base = buildArtistLayer(input);
  return mergeArtistLayer(base, input.preferredArtistLayer);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readPromptValue(body: string, label: string, bullet = false): string | null {
  const prefix = bullet ? '- ' : '';
  const match = body.match(new RegExp(`^${escapeRegex(prefix + label)}:\\s*(.+)$`, 'mi'));
  return match?.[1]?.trim() ?? null;
}

function splitPromptList(value: string | null, delimiter: 'comma' | 'pipe'): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(delimiter === 'pipe' ? '|' : ',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function parseBooleanPromptValue(value: string | null): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseDensity(value: string | null): ArtistLayerSpec['designDirection']['density'] | undefined {
  return value === 'compact' || value === 'comfortable' || value === 'spacious'
    ? value
    : undefined;
}

function parseBreathingRoom(value: string | null): ArtistLayerSpec['designDirection']['breathingRoom'] | undefined {
  return value === 'compressed' || value === 'balanced' || value === 'airy'
    ? value
    : undefined;
}

function parseRedesignMode(value: string | null): RedesignMode | undefined {
  return value === 'preserve'
    || value === 'partial_restyle'
    || value === 'page_redesign'
    || value === 'full_retheme'
    || value === 'full_redesign'
    ? value
    : undefined;
}

function parseStructureLock(value: string | null): RedesignIntent['structureLock'] | undefined {
  return value === 'strict' || value === 'prefer' || value === 'flexible'
    ? value
    : undefined;
}

function parseChangeEnvelope(value: string | null): RedesignIntent['changeEnvelope'] | undefined {
  return value === 'greenfield_foundation'
    || value === 'visual_refresh_without_structural_change'
    || value === 'scoped_redesign'
    || value === 'full_visual_reset'
    || value === 'structural_redesign'
    ? value
    : undefined;
}

export function extractArtistLayerPreferenceFromPromptText(prompt?: string | null): ArtistLayerPreference | null {
  if (!prompt) return null;

  const match = prompt.match(
    /═══ ARTIST LAYER — SOURCE OF TRUTH ═══([\s\S]*?)Follow this artist layer exactly\. It is implementation-ready and inspectable, not optional inspiration\./,
  );
  if (!match) return null;

  const body = match[1];
  const category = readPromptValue(body, 'Category');
  const style = readPromptValue(body, 'Style');
  if (!isCategoryId(category) || !isStyleId(style)) return null;

  const confidenceRaw = Number(readPromptValue(body, 'Confidence'));
  const avoidConstraints = splitPromptList(readPromptValue(body, 'Avoid constraints', true), 'pipe');
  const screensInScope = splitPromptList(readPromptValue(body, 'Screens in scope', true), 'comma');
  const brandAnchors = splitPromptList(readPromptValue(body, 'Brand anchors to preserve', true), 'pipe');
  const previewSafeFallback = readPromptValue(body, 'Preview-safe fallback', true);

  const preference: ArtistLayerPreference = {
    classification: {
      category,
      style,
      confidence: Number.isFinite(confidenceRaw) ? confidenceRaw : 0.8,
      reasoning: 'Recovered from existing artist-layer prompt',
    },
  };

  const designDirection: ArtistLayerPreference['designDirection'] = {
    visualArchetype: readPromptValue(body, 'Visual archetype', true) ?? undefined,
    density: parseDensity(readPromptValue(body, 'Density', true)),
    breathingRoom: parseBreathingRoom(readPromptValue(body, 'Breathing room', true)),
    shellStyle: readPromptValue(body, 'Shell style', true) ?? undefined,
    hierarchyEmphasis: readPromptValue(body, 'Hierarchy emphasis', true) ?? undefined,
    contentRhythm: readPromptValue(body, 'Card/list/content rhythm', true) ?? undefined,
    ctaStrategy: readPromptValue(body, 'CTA strategy', true) ?? undefined,
    imageryStrategy: readPromptValue(body, 'Imagery strategy', true) ?? undefined,
    motionStrategy: readPromptValue(body, 'Motion strategy', true) ?? undefined,
    mobileComposition: readPromptValue(body, 'Mobile composition guidance', true) ?? undefined,
    avoidConstraints,
  };
  if (Object.values(designDirection).some((value) => value !== undefined)) {
    preference.designDirection = designDirection;
  }

  const redesignIntent: ArtistLayerPreference['redesignIntent'] = {
    mode: parseRedesignMode(readPromptValue(body, 'Mode', true)),
    structureLock: parseStructureLock(readPromptValue(body, 'Structure lock', true)),
    changeEnvelope: parseChangeEnvelope(readPromptValue(body, 'Change envelope', true)),
    visualSystemReset: parseBooleanPromptValue(readPromptValue(body, 'Visual system reset', true)),
    structureChangeAllowed: parseBooleanPromptValue(readPromptValue(body, 'Structure change allowed', true)),
    screensInScope,
    brandAnchorsToPreserve: brandAnchors,
  };
  if (Object.values(redesignIntent).some((value) => value !== undefined)) {
    preference.redesignIntent = redesignIntent;
  }

  if (previewSafeFallback) {
    preference.assetPolicy = {
      previewSafeFallback: {
        mediaStrategy: previewSafeFallback,
      },
    };
  }

  return preference;
}

export function buildArtistLayerPrompt(artistLayer: ArtistLayerSpec): string {
  return [
    '═══ ARTIST LAYER — SOURCE OF TRUTH ═══',
    `Category: ${artistLayer.classification.category}`,
    `Style: ${artistLayer.classification.style}`,
    `Confidence: ${artistLayer.classification.confidence}`,
    '',
    'Design direction:',
    `- Visual archetype: ${artistLayer.designDirection.visualArchetype}`,
    `- Density: ${artistLayer.designDirection.density}`,
    `- Breathing room: ${artistLayer.designDirection.breathingRoom}`,
    `- Shell style: ${artistLayer.designDirection.shellStyle}`,
    `- Hierarchy emphasis: ${artistLayer.designDirection.hierarchyEmphasis}`,
    `- Card/list/content rhythm: ${artistLayer.designDirection.contentRhythm}`,
    `- CTA strategy: ${artistLayer.designDirection.ctaStrategy}`,
    `- Imagery strategy: ${artistLayer.designDirection.imageryStrategy}`,
    `- Motion strategy: ${artistLayer.designDirection.motionStrategy}`,
    `- Mobile composition guidance: ${artistLayer.designDirection.mobileComposition}`,
    `- Avoid constraints: ${artistLayer.designDirection.avoidConstraints.join(' | ')}`,
    '',
    'Redesign intent:',
    `- Mode: ${artistLayer.redesignIntent.mode}`,
    `- Structure lock: ${artistLayer.redesignIntent.structureLock}`,
    `- Change envelope: ${artistLayer.redesignIntent.changeEnvelope}`,
    `- Visual system reset: ${artistLayer.redesignIntent.visualSystemReset}`,
    `- Structure change allowed: ${artistLayer.redesignIntent.structureChangeAllowed}`,
    `- Screens in scope: ${artistLayer.redesignIntent.screensInScope.join(', ') || 'all screens'}`,
    `- Brand anchors to preserve: ${artistLayer.redesignIntent.brandAnchorsToPreserve.join(' | ') || 'none'}`,
    '',
    'Asset/source policy:',
    `- Components: ${artistLayer.assetPolicy.components.allowedSources.join(', ')}`,
    `- Icons: ${artistLayer.assetPolicy.icons.allowedSources.join(', ')}`,
    `- Media policy: ${artistLayer.assetPolicy.media.remoteAssetPolicy} (${artistLayer.assetPolicy.media.allowedSources.join(', ')})`,
    `- Font policy: ${artistLayer.assetPolicy.fonts.loadingStrategy} (${artistLayer.assetPolicy.fonts.allowedSources.join(', ')})`,
    `- Advanced resources: ${artistLayer.assetPolicy.advancedResources.allowedSources.join(', ')}`,
    `- Preview-safe fallback: ${artistLayer.assetPolicy.previewSafeFallback.mediaStrategy}`,
    '',
    'Follow this artist layer exactly. It is implementation-ready and inspectable, not optional inspiration.',
  ].join('\n');
}

export function stripArtistLayerPrompt(prompt?: string | null): string {
  if (!prompt) return '';

  const stripped = prompt.replace(
    /\n*═══ ARTIST LAYER — SOURCE OF TRUTH ═══[\s\S]*?Follow this artist layer exactly\. It is implementation-ready and inspectable, not optional inspiration\.\s*/g,
    '\n',
  );

  return stripped.trim();
}

export function extractArtistLayerFromManifestText(raw?: string | null): ArtistLayerSpec | null {
  if (!raw || !raw.trim()) return null;

  try {
    const parsed = JSON.parse(raw) as { artistLayer?: unknown };
    return hasMeaningfulArtistLayer(parsed.artistLayer) ? parsed.artistLayer : null;
  } catch {
    return null;
  }
}

export function extractArtistLayerFromKnownFiles(files?: Record<string, string> | null): ArtistLayerSpec | null {
  if (!files) return null;

  const candidates = [
    'PROJECT_MANIFEST.json',
    '/PROJECT_MANIFEST.json',
    'project-manifest.json',
    '/project-manifest.json',
  ];

  for (const path of candidates) {
    const artistLayer = extractArtistLayerFromManifestText(files[path]);
    if (artistLayer) return artistLayer;
  }

  return null;
}
