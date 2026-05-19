const LIVE_GENERATION_UI_PRIMITIVE_SPECS = [
  {
    id: 'accordion',
    displayName: 'Accordion',
    importCatalogEntry: "Accordion, AccordionContent, AccordionItem, AccordionTrigger from '@/components/ui/accordion'",
  },
  {
    id: 'alert-dialog',
    displayName: 'AlertDialog',
    importCatalogEntry: "AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger from '@/components/ui/alert-dialog'",
  },
  {
    id: 'avatar',
    displayName: 'Avatar',
    importCatalogEntry: "Avatar, AvatarFallback, AvatarImage from '@/components/ui/avatar'",
  },
  {
    id: 'badge',
    displayName: 'Badge',
    importCatalogEntry: "Badge from '@/components/ui/badge'",
  },
  {
    id: 'button',
    displayName: 'Button',
    importCatalogEntry: "Button from '@/components/ui/button'",
  },
  {
    id: 'card',
    displayName: 'Card',
    importCatalogEntry: "Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle from '@/components/ui/card'",
  },
  {
    id: 'dialog',
    displayName: 'Dialog',
    importCatalogEntry: "Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger from '@/components/ui/dialog'",
  },
  {
    id: 'dropdown-menu',
    displayName: 'DropdownMenu',
    importCatalogEntry: "DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger from '@/components/ui/dropdown-menu'",
  },
  {
    id: 'input',
    displayName: 'Input',
    importCatalogEntry: "Input from '@/components/ui/input'",
  },
  {
    id: 'label',
    displayName: 'Label',
    importCatalogEntry: "Label from '@/components/ui/label'",
  },
  {
    id: 'progress',
    displayName: 'Progress',
    importCatalogEntry: "Progress from '@/components/ui/progress'",
  },
  {
    id: 'scroll-area',
    displayName: 'ScrollArea',
    importCatalogEntry: "ScrollArea, ScrollBar from '@/components/ui/scroll-area'",
  },
  {
    id: 'select',
    displayName: 'Select',
    importCatalogEntry: "Select, SelectContent, SelectItem, SelectTrigger, SelectValue from '@/components/ui/select'",
  },
  {
    id: 'separator',
    displayName: 'Separator',
    importCatalogEntry: "Separator from '@/components/ui/separator'",
  },
  {
    id: 'sheet',
    displayName: 'Sheet',
    importCatalogEntry: "Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger from '@/components/ui/sheet'",
  },
  {
    id: 'skeleton',
    displayName: 'Skeleton',
    importCatalogEntry: "Skeleton from '@/components/ui/skeleton'",
  },
  {
    id: 'switch',
    displayName: 'Switch',
    importCatalogEntry: "Switch from '@/components/ui/switch'",
  },
  {
    id: 'tabs',
    displayName: 'Tabs',
    importCatalogEntry: "Tabs, TabsContent, TabsList, TabsTrigger from '@/components/ui/tabs'",
  },
  {
    id: 'textarea',
    displayName: 'Textarea',
    importCatalogEntry: "Textarea from '@/components/ui/textarea'",
  },
  {
    id: 'tooltip',
    displayName: 'Tooltip',
    importCatalogEntry: "Tooltip, TooltipContent, TooltipProvider, TooltipTrigger from '@/components/ui/tooltip'",
  },
] as const;

export type CanonicalUiPrimitive = typeof LIVE_GENERATION_UI_PRIMITIVE_SPECS[number]['id'];
export type UiPrimitiveDisplayName = typeof LIVE_GENERATION_UI_PRIMITIVE_SPECS[number]['displayName'];

export const LIVE_GENERATION_ALLOWED_UI_PRIMITIVES: CanonicalUiPrimitive[] = LIVE_GENERATION_UI_PRIMITIVE_SPECS
  .map(spec => spec.id);

export const LIVE_GENERATION_UI_IMPORT_CATALOG: Record<UiPrimitiveDisplayName, string> = Object.fromEntries(
  LIVE_GENERATION_UI_PRIMITIVE_SPECS.map(spec => [spec.displayName, spec.importCatalogEntry]),
) as Record<UiPrimitiveDisplayName, string>;

export const CANONICAL_FRONTEND_UI_ROOT = 'frontend/src/components/ui';

const SKELETON_IDS_WITH_CANONICAL_UI_ROOTS = [
  'b2b-operations-workspace',
  'booking-service-app',
  'content-learning-app',
  'creator-editor-workspace',
  'dating-matching-app',
  'ecommerce',
  'game-interactive-app',
  'gaming-casino-app',
  'landing-page',
  'marketplace-platform',
  'mobile-app',
  'productivity-tool',
  'saas-dashboard',
  'social-community',
] as const;

export const CANONICAL_SKELETON_UI_ROOTS = SKELETON_IDS_WITH_CANONICAL_UI_ROOTS.map(
  skeletonId => `skeletons/${skeletonId}/skeleton-${skeletonId}/src/components/ui`,
);

const UI_PRIMITIVE_NAME_ALIASES: Record<string, CanonicalUiPrimitive> = Object.fromEntries(
  LIVE_GENERATION_UI_PRIMITIVE_SPECS.flatMap(spec => [
    [spec.displayName, spec.id],
    [spec.id, spec.id],
  ]),
) as Record<string, CanonicalUiPrimitive>;

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values))).sort((left, right) => left.localeCompare(right));
}

function normalizeWorkspacePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

export function toPascalCaseUiPrimitiveName(primitive: CanonicalUiPrimitive): UiPrimitiveDisplayName {
  return primitive
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') as UiPrimitiveDisplayName;
}

export function canonicalUiPrimitiveId(name: string): CanonicalUiPrimitive | null {
  const normalized = name.trim();
  if (!normalized) return null;
  const aliasMatch = UI_PRIMITIVE_NAME_ALIASES[normalized];
  if (aliasMatch) return aliasMatch;
  const kebab = normalized
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
  return LIVE_GENERATION_ALLOWED_UI_PRIMITIVES.includes(kebab as CanonicalUiPrimitive)
    ? kebab as CanonicalUiPrimitive
    : null;
}

export function preferredUiPrimitiveWorkspaceRoots(preferredSkeletonId?: string | null): string[] {
  const preferredRoot = preferredSkeletonId && SKELETON_IDS_WITH_CANONICAL_UI_ROOTS.includes(preferredSkeletonId as typeof SKELETON_IDS_WITH_CANONICAL_UI_ROOTS[number])
    ? `skeletons/${preferredSkeletonId}/skeleton-${preferredSkeletonId}/src/components/ui`
    : null;

  return uniqueSorted([
    ...(preferredRoot ? [preferredRoot] : []),
    CANONICAL_FRONTEND_UI_ROOT,
    ...CANONICAL_SKELETON_UI_ROOTS,
  ]);
}

export function uiPrimitiveWorkspaceCandidates(
  primitive: CanonicalUiPrimitive,
  roots: readonly string[] = preferredUiPrimitiveWorkspaceRoots(),
): string[] {
  const baseNames = uniqueSorted([primitive, toPascalCaseUiPrimitiveName(primitive)]);
  const candidates = roots.flatMap(root => baseNames.flatMap(name => [
    `${root}/${name}.ts`,
    `${root}/${name}.tsx`,
    `${root}/${name}/index.ts`,
    `${root}/${name}/index.tsx`,
  ]));
  return uniqueSorted(candidates.map(normalizeWorkspacePath));
}

export function buildLiveGenerationUiPrimitiveImportCatalog(uiPrimitives: readonly string[]): string {
  const lines = filterAdvertisedUiPrimitiveNames(uiPrimitives)
    .map(name => LIVE_GENERATION_UI_IMPORT_CATALOG[name])
    .filter((line): line is string => Boolean(line))
    .map(line => `  - ${line}`);

  return lines.length > 0
    ? lines.join('\n')
    : '  - (none; implement local components under components/ when needed)';
}

export function filterAdvertisedUiPrimitiveNames(uiPrimitives: readonly string[]): UiPrimitiveDisplayName[] {
  return uiPrimitives.filter((name): name is UiPrimitiveDisplayName => Boolean(LIVE_GENERATION_UI_IMPORT_CATALOG[name as UiPrimitiveDisplayName]));
}