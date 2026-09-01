from pathlib import Path
import json
import shutil

ROOT = Path('.')
BRANCH = 'feat/super-app-first-class-skeleton'


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')


def replace_once(path, old, new):
    content = read(path)
    if old not in content:
        raise RuntimeError(f'Expected text not found in {path}: {old[:120]!r}')
    write(path, content.replace(old, new, 1))


# ---------------------------------------------------------------------------
# 1. Manifest contract: app-first is declarative, not skeleton-id special case.
# ---------------------------------------------------------------------------
replace_once(
    'frontend/src/services/SkeletonManifestContract.ts',
    "export interface SkeletonQualityContractV2 {\n  minMeaningfulScreens?: number;",
    "export type SkeletonQualityProfileV2 = 'general' | 'app-first';\n\nexport interface SkeletonQualityContractV2 {\n  /** Release semantics profile. app-first means screens/navigation/data/actions are blocking quality signals. */\n  profile?: SkeletonQualityProfileV2;\n  minMeaningfulScreens?: number;",
)
replace_once(
    'frontend/src/services/SkeletonManifestContract.ts',
    "  const quality = manifest.qualityContract;\n  if (!Number.isInteger(quality.minMeaningfulScreens)",
    "  const quality = manifest.qualityContract;\n  if (quality.profile !== undefined && !['general', 'app-first'].includes(quality.profile)) {\n    errors.push(`${manifest.id}: qualityContract.profile must be general or app-first`);\n  }\n  if (!Number.isInteger(quality.minMeaningfulScreens)",
)

# Mobile adopts the generic app-first profile explicitly.
mobile_manifest_path = 'frontend/src/services/skeleton-manifests/mobile-app/skeleton.manifest.json'
mobile_manifest = json.loads(read(mobile_manifest_path))
mobile_manifest['qualityContract']['profile'] = 'app-first'
write(mobile_manifest_path, json.dumps(mobile_manifest, indent=2) + '\n')

# ---------------------------------------------------------------------------
# 2. First-class super-app manifest.
# ---------------------------------------------------------------------------
super_manifest = {
  'version': 2,
  'id': 'super-app',
  'label': 'Super App',
  'workingGroups': [
    {'label': 'core', 'paths': ['src/App.tsx', 'src/main.tsx', 'src/index.css', 'src/route-manifest.json']},
    {'label': 'config', 'paths': ['src/config/app.ts', 'src/config/routes.ts', 'src/config/navigation.ts', 'src/config/theme.ts']},
    {'label': 'layout', 'paths': ['src/components/BottomTabs.tsx']},
    {'label': 'states', 'paths': ['src/components/ErrorBoundary.tsx', 'src/components/LoadingScreen.tsx', 'src/components/EmptyState.tsx', 'src/components/PaywallSheet.tsx']},
    {'label': 'ui', 'paths': ['src/components/ui/*']},
    {'label': 'hooks', 'paths': ['src/hooks/useLocalStorage.ts', 'src/hooks/useTheme.ts']},
    {'label': 'runtime', 'paths': ['src/context/AppContext.tsx', 'src/lib/cn.ts']},
  ],
  'ownership': {
    'skeletonOwned': [
      'src/main.tsx', 'src/index.css', 'src/lib/**', 'src/context/AppContext.tsx',
      'src/hooks/useLocalStorage.ts', 'src/hooks/useTheme.ts', 'src/components/ui/**',
      'src/components/BottomTabs.tsx', 'src/components/ErrorBoundary.tsx',
      'src/components/LoadingScreen.tsx', 'src/components/EmptyState.tsx', 'src/components/PaywallSheet.tsx'
    ],
    'requiredProductSlots': [
      'src/config/app.ts', 'src/config/routes.ts', 'src/config/navigation.ts',
      'src/data/types.ts', 'src/data/seed.ts',
      'src/pages/Onboarding.tsx', 'src/pages/Home.tsx',
      'src/pages/Finance.tsx', 'src/pages/Wellness.tsx', 'src/pages/Learning.tsx', 'src/pages/Profile.tsx'
    ],
    'optionalProductSlots': [],
    'agentEditable': [
      'src/config/app.ts', 'src/config/routes.ts', 'src/config/navigation.ts',
      'src/data/types.ts', 'src/data/seed.ts',
      'src/pages/Onboarding.tsx', 'src/pages/Home.tsx',
      'src/pages/Finance.tsx', 'src/pages/Wellness.tsx', 'src/pages/Learning.tsx', 'src/pages/Profile.tsx'
    ],
    'agentReadOnly': [
      'src/main.tsx', 'src/index.css', 'src/lib/**', 'src/context/AppContext.tsx',
      'src/hooks/useLocalStorage.ts', 'src/hooks/useTheme.ts', 'src/components/ui/**',
      'src/components/BottomTabs.tsx', 'src/components/ErrorBoundary.tsx',
      'src/components/LoadingScreen.tsx', 'src/components/EmptyState.tsx', 'src/components/PaywallSheet.tsx'
    ],
    'carcassFiles': [],
  },
  'protectedFiles': [
    'src/main.tsx', 'src/index.css', 'src/lib/**', 'src/context/AppContext.tsx',
    'src/hooks/useLocalStorage.ts', 'src/hooks/useTheme.ts', 'src/components/ui/**',
    'src/components/BottomTabs.tsx', 'src/components/ErrorBoundary.tsx',
    'src/components/LoadingScreen.tsx', 'src/components/EmptyState.tsx', 'src/components/PaywallSheet.tsx'
  ],
  'requiredExports': {},
  'qualityContract': {
    'profile': 'app-first',
    'minMeaningfulScreens': 6,
    'requiredCapabilities': ['navigation', 'onboarding', 'primary-action', 'profile', 'multi-domain'],
    'requiredFlows': ['onboarding-to-home', 'home-to-domain', 'domain-action'],
  },
  'selectionContract': {
    'productTypes': ['super-app', 'multi-domain-consumer'],
    'surfaces': ['mobile', 'bottom-tabs', 'domain-hub', 'finance', 'wellness', 'learning', 'profile', 'onboarding'],
    'layouts': ['bottom-tabs', 'domain-hub', 'multi-domain-home', 'domain-detail'],
    'capabilities': ['navigation', 'onboarding', 'profile', 'primary-action', 'multi-domain'],
    'incompatibleArchetypes': ['marketing', 'dashboard', 'single-purpose-tool'],
  },
}
write('frontend/src/services/skeleton-manifests/super-app/skeleton.manifest.json', json.dumps(super_manifest, indent=2) + '\n')

# Compiler imports and compiles the new manifest. Quality profile defaults to general.
replace_once(
    'frontend/src/services/SkeletonContractCompiler.ts',
    "import mobileAppManifest from './skeleton-manifests/mobile-app/skeleton.manifest.json';",
    "import mobileAppManifest from './skeleton-manifests/mobile-app/skeleton.manifest.json';\nimport superAppManifest from './skeleton-manifests/super-app/skeleton.manifest.json';",
)
replace_once(
    'frontend/src/services/SkeletonContractCompiler.ts',
    "export interface CompiledSkeletonQualityContract {\n  minMeaningfulScreens: number;",
    "export interface CompiledSkeletonQualityContract {\n  profile: 'general' | 'app-first';\n  minMeaningfulScreens: number;",
)
replace_once(
    'frontend/src/services/SkeletonContractCompiler.ts',
    "const manifests: Record<SkeletonId, SkeletonManifestV2> = {\n  'mobile-app': mobileAppManifest as SkeletonManifestV2,",
    "const manifests: Record<SkeletonId, SkeletonManifestV2> = {\n  'mobile-app': mobileAppManifest as SkeletonManifestV2,\n  'super-app': superAppManifest as SkeletonManifestV2,",
)
replace_once(
    'frontend/src/services/SkeletonContractCompiler.ts',
    "  const quality: CompiledSkeletonQualityContract = {\n    minMeaningfulScreens:",
    "  const quality: CompiledSkeletonQualityContract = {\n    profile: manifest.qualityContract.profile ?? 'general',\n    minMeaningfulScreens:",
)

# ---------------------------------------------------------------------------
# 3. Registry metadata and selection. Super-app is independently selectable.
# ---------------------------------------------------------------------------
replace_once(
    'frontend/src/services/SkeletonRegistry.ts',
    "export type SkeletonId =\n  | 'mobile-app'",
    "export type SkeletonId =\n  | 'mobile-app'\n  | 'super-app'",
)

super_registry_entry = r'''  'super-app': {
    id: 'super-app',
    label: 'Super App',
    description:
      'Multi-domain consumer app with one shared identity and bottom navigation across distinct product domains such as money, wellness, learning, services, or lifestyle.',
    tags: [
      'super app', 'superapp', 'multi domain', 'multi-domain', 'all in one', 'all-in-one',
      'life os', 'life hub', 'everything app', 'multi service', 'multi-service',
      'finance health learning', 'money wellness learning', 'ecosystem app',
    ],
    navigation: 'bottom-tabs',
    providedComponents: [
      'ErrorBoundary', 'LoadingScreen', 'EmptyState',
      'BottomTabs', 'PaywallSheet',
    ],
    providedHooks: ['useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'AlertDialog', 'Avatar', 'Badge', 'Button', 'Card', 'Dialog',
      'Input', 'Label', 'Progress', 'ScrollArea', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['mobile', 'bottom-tabs', 'domain-hub', 'finance', 'wellness', 'learning', 'profile', 'onboarding'],
      allowedLayoutPatterns: ['bottom-tabs', 'domain-hub', 'multi-domain-home', 'card-feed', 'list-detail', 'onboarding-flow', 'profile-stack'],
      allowedDensityProfiles: ['compact', 'comfortable', 'spacious'],
      allowedMotionProfiles: ['gentle', 'expressive', 'reduced'],
      allowedComponentFamilies: ['mobile-nav', 'domain-card', 'feed-item', 'onboarding-step', 'profile-card', 'card', 'list-item'],
      forbiddenVisualPatterns: ['desktop-only sidebar shell', 'single giant marketing page', 'one-domain-only shell', 'tiny tap targets'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns the same shared application/profile contract used by app-first mobile products:
  isOnboarded: boolean
  profile: { id, name, goal, createdAt, onboardingComplete, plan, usageCount }
  isPremium: boolean
  loadingState: 'loading' | 'ready' | 'error'
  completeOnboarding({ name: string, goal: string })
  updateProfile(patch: Partial<UserProfile>)
  consumeAction(limit: number): boolean
  setPlan(plan)
  resetProfile()
  themeChoice, resolvedTheme, setTheme(choice)

SUPER-APP RULES:
- Treat each declared domain as a real product surface with its own reachable screen, product data, and at least one meaningful action.
- Keep one shared AppContext/profile and one navigation shell; do NOT build isolated mini-app roots.
- Do NOT collapse all domains into a static dashboard. The Home screen is a hub; domain screens must remain independently reachable.
- NEVER rewrite App.tsx, BottomTabs, AppContext, or shared skeleton infrastructure.
- Onboarding MUST finish through completeOnboarding({ name, goal }).
`,
  },

'''
replace_once(
    'frontend/src/services/SkeletonRegistry.ts',
    "  'saas-dashboard': {",
    super_registry_entry + "  'saas-dashboard': {",
)

# Coder nav contract: same bottom-tab contract, own route keys.
super_nav = r'''  'super-app': {
    navMode: 'bottom-tabs',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'BOTTOM_TABS',
        type: 'readonly NavItem[]',
        description: 'shared bottom navigation across the super-app domain hub and domain surfaces',
      },
    ],
    primaryNavComponentPath: '@/components/BottomTabs',
    primaryNavComponentExport: 'BottomTabs',
    rules: [
      'Import BottomTabs from @/components/BottomTabs (NOT from @/components/ui).',
      'BOTTOM_TABS is read-only; do NOT re-declare or re-export it outside config/navigation.ts.',
      'config/routes.ts MUST export ROUTES with keys: home, finance, wellness, learning, profile plus onboarding.',
      'Every domain tab must target a real registered route and a real product screen.',
    ],
  },

'''
replace_once(
    'frontend/src/services/SkeletonContractForCoder.ts',
    "  'ecommerce': {",
    super_nav + "  'ecommerce': {",
)
replace_once(
    'frontend/src/services/SkeletonContractForCoder.ts',
    "// Bottom-tabs skeletons: mobile-app, ecommerce, marketplace-platform, social-community,",
    "// Bottom-tabs skeletons: mobile-app, super-app, ecommerce, marketplace-platform, social-community,",
)

# ---------------------------------------------------------------------------
# 4. Stage 5 app-first gate becomes profile-driven. No mobile-specific exception.
# ---------------------------------------------------------------------------
replace_once(
    'frontend/src/services/AppFirstQualityGate.ts',
    "  profile: 'mobile-app' | 'not-app-first';",
    "  profile: 'app-first' | 'not-app-first';",
)
replace_once(
    'frontend/src/services/AppFirstQualityGate.ts',
    "  const minimumMeaningfulScreens = input.skeletonId === 'mobile-app'\n    ? getSkeletonQualityContract(input.skeletonId).minMeaningfulScreens\n    : 0;\n\n  if (input.skeletonId !== 'mobile-app') {",
    "  const qualityContract = getSkeletonQualityContract(input.skeletonId);\n  const isAppFirst = qualityContract.profile === 'app-first';\n  const minimumMeaningfulScreens = isAppFirst ? qualityContract.minMeaningfulScreens : 0;\n\n  if (!isAppFirst) {",
)
for old, new in [
    ('Mobile app has only', 'App-first prototype has only'),
    ('real mobile screens', 'real app screens'),
    ('Architect-planned mobile screens', 'Architect-planned app screens'),
    ('Mobile navigation graph', 'App navigation graph'),
    ('Mobile screen connectivity', 'App screen connectivity'),
    ('Mobile product data', 'App product data'),
    ('Mobile app contains', 'App-first prototype contains'),
    ('Mobile actions are insufficient', 'App actions are insufficient'),
    ('Mobile functional flow coverage', 'App functional flow coverage'),
    ('Mobile screens have no obvious derived-data signal', 'App screens have no obvious derived-data signal'),
    ("profile: 'mobile-app',", "profile: 'app-first',"),
]:
    content = read('frontend/src/services/AppFirstQualityGate.ts')
    if old not in content:
        raise RuntimeError(f'AppFirstQualityGate replacement missing: {old}')
    write('frontend/src/services/AppFirstQualityGate.ts', content.replace(old, new))

# ProtoPipeline uses the diagnostics/profile rather than hardcoded mobile id.
replace_once(
    'frontend/src/services/ProtoPipeline.ts',
    "  quality_profile: 'mobile-app' | 'landing-page' | 'general';",
    "  quality_profile: 'app-first' | 'landing-page' | 'general';",
)
replace_once(
    'frontend/src/services/ProtoPipeline.ts',
    "  const qualityProfile: PrototypeQualityGateTelemetry['quality_profile'] =\n    input.skeletonId === 'mobile-app'\n      ? 'mobile-app'\n      : input.skeletonId === 'landing-page'\n        ? 'landing-page'\n        : 'general';",
    "  const qualityProfile: PrototypeQualityGateTelemetry['quality_profile'] =\n    input.appFirstQualityDiagnostics?.telemetry.checked\n      ? 'app-first'\n      : input.skeletonId === 'landing-page'\n        ? 'landing-page'\n        : 'general';",
)
replace_once(
    'frontend/src/services/ProtoPipeline.ts',
    "  if (qualityProfile === 'mobile-app' && appFirst !== null) {",
    "  if (qualityProfile === 'app-first' && appFirst !== null) {",
)
replace_once(
    'frontend/src/services/ProtoPipeline.ts',
    "psd !== null && qualityProfile !== 'mobile-app' && (",
    "psd !== null && qualityProfile !== 'app-first' && (",
)
replace_once(
    'frontend/src/services/ProtoPipeline.ts',
    "  /** Surface profile. Mobile app enables app-first release semantics. */",
    "  /** Surface profile. Manifest-declared app-first skeletons enable app-first release semantics. */",
)
replace_once(
    'frontend/src/services/ProtoPipeline.ts',
    "  /** App-first mobile diagnostics. Null/undefined = check not run. */",
    "  /** App-first diagnostics. Null/undefined = check not run. */",
)

# ---------------------------------------------------------------------------
# 5. Exhaustive maps: super-app reuses mobile visual language, not mobile skeleton logic.
# ---------------------------------------------------------------------------
replace_once(
    'frontend/src/services/DesignContract.ts',
    "  'mobile-app':                  'consumer-feed',",
    "  'mobile-app':                  'consumer-feed',\n  'super-app':                   'consumer-feed',",
)
replace_once(
    'frontend/src/services/FileVisualBankService.ts',
    "  'mobile-app':               ['mobile', 'bottom-tabs', 'feed', 'detail', 'profile', 'onboarding'],",
    "  'mobile-app':               ['mobile', 'bottom-tabs', 'feed', 'detail', 'profile', 'onboarding'],\n  'super-app':                ['mobile', 'bottom-tabs', 'domain-hub', 'finance', 'wellness', 'learning', 'profile', 'onboarding'],",
)
replace_once(
    'frontend/src/services/FileVisualBankService.ts',
    "const SURFACE_SOURCE_FILES: Record<SkeletonId, string[]> = {\n  'mobile-app': [",
    "const SURFACE_SOURCE_FILES: Record<SkeletonId, string[]> = {\n  'super-app': [\n    'prototype-bank/design-packs/surfaces/blocks/mobile-nav.tsx',\n    'prototype-bank/design-packs/surfaces/blocks/feed-item.tsx',\n    'prototype-bank/design-packs/surfaces/blocks/onboarding-step.tsx',\n    'prototype-bank/design-packs/surfaces/cards/profile-card.tsx',\n  ],\n  'mobile-app': [",
)
replace_once(
    'frontend/src/services/FileVisualBankService.ts',
    "  { id: 'mobile-app', rx: /\\b(mobile|app|habit|tracker|journal|fitness|wellness|health app|прилож|трекер|дневник|привыч)/i },",
    "  { id: 'super-app', rx: /\\b(super app|superapp|multi domain|all in one|life os|life hub|everything app|multi service)/i },\n  { id: 'mobile-app', rx: /\\b(mobile|app|habit|tracker|journal|fitness|wellness|health app|прилож|трекер|дневник|привыч)/i },",
)

mobile_pack_path = 'prototype-bank/design-packs/domain/mobile-app/manifest.json'
mobile_pack = json.loads(read(mobile_pack_path))
if 'super-app' not in mobile_pack['compatibleSkeletons']:
    mobile_pack['compatibleSkeletons'].insert(1, 'super-app')
write(mobile_pack_path, json.dumps(mobile_pack, indent=2) + '\n')

# Live contract protected shell names remain shared, declared for the new id.
replace_once(
    'frontend/src/services/LiveGenerationContractValidator.ts',
    "  'mobile-app': ['BottomTabs', 'AppShell', 'NavigationShell'],",
    "  'mobile-app': ['BottomTabs', 'AppShell', 'NavigationShell'],\n  'super-app': ['BottomTabs', 'AppShell', 'NavigationShell'],",
)

# Make the visual-bank admin order deterministic and visible.
replace_once(
    'frontend/src/modules/visual-bank/VisualBankModule.tsx',
    "  'mobile-app',",
    "  'mobile-app',\n  'super-app',",
)

# ---------------------------------------------------------------------------
# 6. Physical first-class skeleton. Copy common primitives, then replace shell/product slots.
# ---------------------------------------------------------------------------
mobile_root = ROOT / 'skeletons/mobile-app/skeleton-mobile-app'
super_root = ROOT / 'skeletons/super-app/skeleton-super-app'
if super_root.exists():
    shutil.rmtree(super_root)
super_root.parent.mkdir(parents=True, exist_ok=True)
shutil.copytree(mobile_root, super_root)

pkg = json.loads((super_root / 'package.json').read_text(encoding='utf-8'))
pkg['name'] = 'skeleton-super-app'
pkg['version'] = '0.1.0'
(super_root / 'package.json').write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')

(super_root / 'README.md').write_text('''# Super App Skeleton\n\nFirst-class multi-domain app skeleton for AIC RG Studio.\n\nThe protected shell owns routing, onboarding guards, shared profile/context, bottom navigation, loading/error states, theme hooks, and UI primitives. Product generation writes only the manifest-declared config/data/page slots.\n\nDefault domain topology: Home hub + Finance + Wellness + Learning + Profile. The generated product may rename/re-theme these domain slots, but must keep all declared domains reachable and functional through one shared app shell.\n''', encoding='utf-8')

route_manifest = {
  'skeletonId': 'super-app',
  'label': 'Super App',
  'version': '0.1.0',
  'navigation': 'bottom-tabs',
  'shell': 'AppShell wraps OnboardingGuard + shared BottomTabs across multiple product domains',
  'routes': [
    {'path': '/onboarding', 'page': 'src/pages/Onboarding.tsx', 'guard': 'GuestGuard'},
    {'path': '/home', 'page': 'src/pages/Home.tsx', 'guard': 'OnboardingGuard'},
    {'path': '/finance', 'page': 'src/pages/Finance.tsx', 'guard': 'OnboardingGuard', 'domain': 'finance'},
    {'path': '/wellness', 'page': 'src/pages/Wellness.tsx', 'guard': 'OnboardingGuard', 'domain': 'wellness'},
    {'path': '/learning', 'page': 'src/pages/Learning.tsx', 'guard': 'OnboardingGuard', 'domain': 'learning'},
    {'path': '/profile', 'page': 'src/pages/Profile.tsx', 'guard': 'OnboardingGuard'},
  ],
  'tabs': [
    {'to': '/home', 'label': 'Home'},
    {'to': '/finance', 'label': 'Money'},
    {'to': '/wellness', 'label': 'Wellness'},
    {'to': '/learning', 'label': 'Learn'},
    {'to': '/profile', 'label': 'Profile'},
  ],
  'providedComponents': ['ErrorBoundary', 'LoadingScreen', 'EmptyState', 'BottomTabs', 'PaywallSheet'],
  'providedHooks': ['useApp', 'useLocalStorage', 'useTheme'],
  'uiPrimitives': ['Avatar', 'Badge', 'Button', 'Card', 'Dialog', 'Input', 'Progress', 'Select', 'Sheet', 'Skeleton', 'Tabs'],
  'config': {'appIdentity': 'src/config/app.ts', 'routes': 'src/config/routes.ts', 'navigation': 'src/config/navigation.ts', 'theme': 'src/config/theme.ts'},
  'productContract': {'profile': 'app-first', 'domains': ['finance', 'wellness', 'learning'], 'sharedShell': True},
}
(super_root / 'src/route-manifest.json').write_text(json.dumps(route_manifest, indent=2) + '\n', encoding='utf-8')

(super_root / 'src/App.tsx').write_text(r'''import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from '@/context/AppContext';
import { ROUTES } from '@/config/routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingScreen } from '@/components/LoadingScreen';
import { BottomTabs } from '@/components/BottomTabs';

const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Home = lazy(() => import('@/pages/Home'));
const Finance = lazy(() => import('@/pages/Finance'));
const Wellness = lazy(() => import('@/pages/Wellness'));
const Learning = lazy(() => import('@/pages/Learning'));
const Profile = lazy(() => import('@/pages/Profile'));

function AppShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <main className="flex-1">{children}</main>
      <BottomTabs />
    </div>
  );
}

function OnboardingGuard({ children }: { children: ReactNode }): JSX.Element {
  const { isOnboarded } = useApp();
  const location = useLocation();
  if (!isOnboarded) return <Navigate to={ROUTES.onboarding} replace state={{ from: location }} />;
  return <>{children}</>;
}

function GuestGuard({ children }: { children: ReactNode }): JSX.Element {
  const { isOnboarded } = useApp();
  if (isOnboarded) return <Navigate to={ROUTES.home} replace />;
  return <>{children}</>;
}

function ProtectedPage({ children }: { children: ReactNode }): JSX.Element {
  return <OnboardingGuard><AppShell>{children}</AppShell></OnboardingGuard>;
}

export default function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path={ROUTES.onboarding} element={<GuestGuard><Onboarding /></GuestGuard>} />
              <Route path={ROUTES.home} element={<ProtectedPage><Home /></ProtectedPage>} />
              <Route path={ROUTES.finance} element={<ProtectedPage><Finance /></ProtectedPage>} />
              <Route path={ROUTES.wellness} element={<ProtectedPage><Wellness /></ProtectedPage>} />
              <Route path={ROUTES.learning} element={<ProtectedPage><Learning /></ProtectedPage>} />
              <Route path={ROUTES.profile} element={<ProtectedPage><Profile /></ProtectedPage>} />
              <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
''', encoding='utf-8')

(super_root / 'src/config/app.ts').write_text(r'''export const APP_CONFIG = {
  name: 'AppName',
  tagline: 'One calm place for the parts of life that matter.',
  freeActionLimit: 5,
  storagePrefix: 'super-app.v1',
} as const;

export const STORAGE_KEYS = {
  profile: `${APP_CONFIG.storagePrefix}.profile`,
  theme: `${APP_CONFIG.storagePrefix}.theme`,
  feed: `${APP_CONFIG.storagePrefix}.feed`,
  progress: `${APP_CONFIG.storagePrefix}.progress`,
} as const;
''', encoding='utf-8')

(super_root / 'src/config/routes.ts').write_text(r'''export const ROUTES = {
  onboarding: '/onboarding',
  home: '/home',
  finance: '/finance',
  wellness: '/wellness',
  learning: '/learning',
  profile: '/profile',
} as const;

export type RouteKey = keyof typeof ROUTES;
''', encoding='utf-8')

(super_root / 'src/config/navigation.ts').write_text(r'''import { Home as HomeIcon, WalletCards, HeartPulse, GraduationCap, User, type LucideIcon } from 'lucide-react';
import { ROUTES } from './routes';

export interface TabDefinition {
  to: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}

export const BOTTOM_TABS: readonly TabDefinition[] = [
  { to: ROUTES.home, label: 'Home', icon: HomeIcon },
  { to: ROUTES.finance, label: 'Money', icon: WalletCards },
  { to: ROUTES.wellness, label: 'Wellness', icon: HeartPulse, primary: true },
  { to: ROUTES.learning, label: 'Learn', icon: GraduationCap },
  { to: ROUTES.profile, label: 'Profile', icon: User },
] as const;
''', encoding='utf-8')

(super_root / 'src/data/types.ts').write_text(r'''import type { ThemeChoice } from '@/config/theme';

export type ID = string;
export type SubscriptionPlan = 'free' | 'pro' | 'team';
export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';
export type DomainId = 'finance' | 'wellness' | 'learning';

export interface UserProfile {
  id: ID;
  name: string;
  goal: string;
  createdAt: string;
  onboardingComplete: boolean;
  plan: SubscriptionPlan;
  usageCount: number;
}

export interface DomainSummary {
  id: DomainId;
  title: string;
  subtitle: string;
  metricLabel: string;
  metricValue: string;
}

export interface DomainActivity {
  id: ID;
  domain: DomainId;
  title: string;
  value: number;
  unit: string;
}

export type { ThemeChoice };
''', encoding='utf-8')

(super_root / 'src/data/seed.ts').write_text(r'''import type { DomainActivity, DomainSummary } from './types';

export const DOMAIN_SUMMARIES: readonly DomainSummary[] = [
  { id: 'finance', title: 'Money', subtitle: 'Weekly spending and budget', metricLabel: 'Left this week', metricValue: '$286' },
  { id: 'wellness', title: 'Wellness', subtitle: 'Sleep, hydration, and movement', metricLabel: 'Water today', metricValue: '5 / 8' },
  { id: 'learning', title: 'Learning', subtitle: 'Short practice and streaks', metricLabel: 'Current streak', metricValue: '12 days' },
];

export const DOMAIN_ACTIVITY: readonly DomainActivity[] = [
  { id: 'expense-1', domain: 'finance', title: 'Groceries', value: 64, unit: 'USD' },
  { id: 'water-1', domain: 'wellness', title: 'Water', value: 5, unit: 'glasses' },
  { id: 'lesson-1', domain: 'learning', title: 'Spanish practice', value: 10, unit: 'minutes' },
];
''', encoding='utf-8')

# Keep the proven mobile onboarding contract intact, only tweak the example copy.
onboarding = (mobile_root / 'src/pages/Onboarding.tsx').read_text(encoding='utf-8')
onboarding = onboarding.replace('e.g. Build a calmer morning routine', 'e.g. Balance money, health, and learning in one place')
(super_root / 'src/pages/Onboarding.tsx').write_text(onboarding, encoding='utf-8')

(super_root / 'src/pages/Home.tsx').write_text(r'''import { Link } from 'react-router-dom';
import { DOMAIN_SUMMARIES } from '@/data/seed';
import { ROUTES } from '@/config/routes';

const DOMAIN_ROUTES = {
  finance: ROUTES.finance,
  wellness: ROUTES.wellness,
  learning: ROUTES.learning,
} as const;

export default function Home(): JSX.Element {
  return (
    <section className="space-y-5 p-6 pb-24">
      <div><p className="text-sm text-muted-foreground">Your day</p><h1 className="text-2xl font-semibold">Life hub</h1></div>
      <div className="grid gap-3">
        {DOMAIN_SUMMARIES.map(domain => (
          <Link key={domain.id} to={DOMAIN_ROUTES[domain.id]} className="rounded-2xl border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="font-semibold">{domain.title}</h2><p className="text-sm text-muted-foreground">{domain.subtitle}</p></div>
              <div className="text-right"><p className="text-xs text-muted-foreground">{domain.metricLabel}</p><strong>{domain.metricValue}</strong></div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
''', encoding='utf-8')

(super_root / 'src/pages/Finance.tsx').write_text(r'''import { useMemo, useState } from 'react';
import { DOMAIN_ACTIVITY } from '@/data/seed';

export default function Finance(): JSX.Element {
  const initial = useMemo(() => DOMAIN_ACTIVITY.filter(item => item.domain === 'finance'), []);
  const [entries, setEntries] = useState(() => [...initial]);
  const [amount, setAmount] = useState('18');
  const total = entries.reduce((sum, item) => sum + item.value, 0);
  return <section className="space-y-4 p-6 pb-24"><h1 className="text-2xl font-semibold">Money</h1><p>Tracked spending: ${total}</p><label className="block text-sm">Expense amount<input aria-label="Expense amount" className="mt-1 w-full rounded-xl border p-3" value={amount} onChange={event => setAmount(event.target.value)} /></label><button className="rounded-xl bg-primary px-4 py-2 text-primary-foreground" onClick={() => setEntries(current => [...current, { id: `local-${current.length}`, domain: 'finance', title: 'Quick expense', value: Number(amount) || 0, unit: 'USD' }])}>Add expense</button><p>Entries: {entries.length}</p></section>;
}
''', encoding='utf-8')

(super_root / 'src/pages/Wellness.tsx').write_text(r'''import { useState } from 'react';
import { DOMAIN_ACTIVITY } from '@/data/seed';

export default function Wellness(): JSX.Element {
  const seed = DOMAIN_ACTIVITY.find(item => item.domain === 'wellness');
  const [water, setWater] = useState(seed?.value ?? 0);
  return <section className="space-y-4 p-6 pb-24"><h1 className="text-2xl font-semibold">Wellness</h1><p>Hydration today: {water} glasses</p><button className="rounded-xl bg-primary px-4 py-2 text-primary-foreground" onClick={() => setWater(value => value + 1)}>Log water</button><p>{water >= 8 ? 'Hydration goal reached' : `${8 - water} glasses to goal`}</p></section>;
}
''', encoding='utf-8')

(super_root / 'src/pages/Learning.tsx').write_text(r'''import { useMemo, useState } from 'react';
import { DOMAIN_ACTIVITY } from '@/data/seed';

export default function Learning(): JSX.Element {
  const minutes = useMemo(() => DOMAIN_ACTIVITY.filter(item => item.domain === 'learning').reduce((sum, item) => sum + item.value, 0), []);
  const [sessions, setSessions] = useState(1);
  return <section className="space-y-4 p-6 pb-24"><h1 className="text-2xl font-semibold">Learning</h1><p>Practice minutes: {minutes}</p><p>Sessions today: {sessions}</p><button className="rounded-xl bg-primary px-4 py-2 text-primary-foreground" onClick={() => setSessions(value => value + 1)}>Complete practice</button></section>;
}
''', encoding='utf-8')

(super_root / 'src/pages/Profile.tsx').write_text(r'''import { useState } from 'react';
import { APP_CONFIG } from '@/config/app';
import { useApp } from '@/context/AppContext';

export default function Profile(): JSX.Element {
  const { profile } = useApp();
  const [digest, setDigest] = useState(true);
  return <section className="space-y-4 p-6 pb-24"><h1 className="text-2xl font-semibold">Profile</h1><p>{profile.name || 'Your profile'} · {APP_CONFIG.name}</p><p className="text-sm text-muted-foreground">{profile.goal || APP_CONFIG.tagline}</p><button className="rounded-xl border px-4 py-2" onClick={() => setDigest(value => !value)}>Daily digest: {digest ? 'On' : 'Off'}</button></section>;
}
''', encoding='utf-8')

for stale in ['Detail.tsx', 'Create.tsx', 'Progress.tsx']:
    p = super_root / 'src/pages' / stale
    if p.exists(): p.unlink()

# ---------------------------------------------------------------------------
# 7. Contract tests: prove first-class identity and shared app-first semantics.
# ---------------------------------------------------------------------------
write('frontend/src/services/__tests__/SuperAppSkeletonContract.test.ts', r'''import { describe, expect, it } from 'vitest';
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
''')

# Backend physical-source invariant includes the new UI barrel.
replace_once(
    'backend/preview-manager.test.ts',
    "      path.resolve('skeletons/mobile-app/skeleton-mobile-app/src/components/ui/index.ts'),",
    "      path.resolve('skeletons/mobile-app/skeleton-mobile-app/src/components/ui/index.ts'),\n      path.resolve('skeletons/super-app/skeleton-super-app/src/components/ui/index.ts'),",
)

# Clean the temporary patch mechanism out of the resulting commit.
for temp in ['.github/stage6_super_app_patch.py', '.github/workflows/stage6-super-app-self-patch.yml']:
    p = ROOT / temp
    if p.exists():
        p.unlink()

print('Stage 6 super-app core patch applied')
