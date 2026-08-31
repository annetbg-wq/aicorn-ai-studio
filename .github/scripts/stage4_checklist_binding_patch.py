from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} anchor mismatch: {count}")
    return text.replace(old, new, 1)


# ProductDeltaContract: add runtime verification binding to current compiled plan.
p = Path('frontend/src/services/ProductDeltaContract.ts')
text = p.read_text()
text = replace_once(
    text,
    """export interface ProductDeltaSpec {\n  path: string;\n  purpose: string;\n}\n""",
    """export interface ProductDeltaSpec {\n  path: string;\n  purpose: string;\n}\n\nexport interface ProductDeltaChecklistTargetItem {\n  targetFiles: string[];\n}\n""",
    'ProductDelta checklist interface',
)
helper = r'''

/**
 * Bind checklist verification targets to the CURRENT compiled product-delta plan.
 *
 * Product-document packages are topic-reusable and can outlive one concrete file
 * layout. Their semantic acceptance requirements remain useful, but stale target
 * paths must not drive CompletenessGate or Pass 2 after the current architect plan
 * has been filtered through the compiled skeleton contract.
 *
 * This is verification binding only: it never grants write permission. The write
 * allow-list remains requiredSlots + optionalSlots from getProductDeltaScope().
 */
export function bindFeatureChecklistTargetsToProductDeltaPlan<
  T extends ProductDeltaChecklistTargetItem,
>(
  skeletonId: SkeletonId,
  items: readonly T[],
  plannedSpecs: readonly Pick<ProductDeltaSpec, 'path'>[],
): T[] {
  const allowed = new Set(getProductDeltaScope(skeletonId).allowed);
  const plannedPaths = unique(
    plannedSpecs
      .map(spec => normalizeProductDeltaPath(spec.path))
      .filter(path => allowed.has(path)),
  );
  const planned = new Set(plannedPaths);

  if (plannedPaths.length === 0) {
    return items.map(item => ({
      ...item,
      targetFiles: unique(
        item.targetFiles
          .map(normalizeProductDeltaPath)
          .filter(path => allowed.has(path)),
      ),
    }));
  }

  const fallbackTarget =
    plannedPaths.find(path => path === 'App.tsx')
    ?? plannedPaths.find(path => /^pages\/.*\.(?:tsx|jsx)$/i.test(path))
    ?? plannedPaths.find(path => /\.(?:tsx|jsx)$/i.test(path))
    ?? plannedPaths[0];

  return items.map(item => {
    const currentTargets = unique(
      item.targetFiles
        .map(normalizeProductDeltaPath)
        .filter(path => planned.has(path)),
    );
    return {
      ...item,
      targetFiles: currentTargets.length > 0 ? currentTargets : [fallbackTarget],
    };
  });
}
'''
if 'bindFeatureChecklistTargetsToProductDeltaPlan' in text:
    raise SystemExit('ProductDelta checklist helper already present')
text = text.rstrip() + helper + '\n'
p.write_text(text)


# ProtoPipeline: use the bound checklist consistently for gate, critic and implementer.
p = Path('frontend/src/services/ProtoPipeline.ts')
text = p.read_text()
text = replace_once(
    text,
    "import { filterProductDeltaFiles, filterProductDeltaSpecs, getProductDeltaScope, normalizeProductDeltaPath } from './ProductDeltaContract';",
    "import { bindFeatureChecklistTargetsToProductDeltaPlan, filterProductDeltaFiles, filterProductDeltaSpecs, getProductDeltaScope, normalizeProductDeltaPath } from './ProductDeltaContract';",
    'ProtoPipeline ProductDelta import',
)
text = replace_once(
    text,
    "    const pass2FeatureChecklist = productDocumentSet.productDocs.featureChecklist ?? [];",
    """    const rawPass2FeatureChecklist = productDocumentSet.productDocs.featureChecklist ?? [];
    const pass2FeatureChecklist = bindFeatureChecklistTargetsToProductDeltaPlan(
      config.skeletonId,
      rawPass2FeatureChecklist,
      plan.deltaFiles,
    );
    const reboundChecklistTargets = pass2FeatureChecklist.filter((item, index) => {
      const before = rawPass2FeatureChecklist[index]?.targetFiles ?? [];
      return before.join('|') !== item.targetFiles.join('|');
    }).length;
    if (reboundChecklistTargets > 0) {
      log(
        `[completeness] rebound ${reboundChecklistTargets}/${pass2FeatureChecklist.length} checklist target(s) to current compiled product delta`,
        'warn',
      );
    }""",
    'ProtoPipeline pass2 checklist binding',
)
p.write_text(text)


# Invariant tests for stale-target rebinding.
p = Path('frontend/src/services/__tests__/ProductDeltaContract.test.ts')
text = p.read_text()
text = replace_once(
    text,
    """import {
  filterProductDeltaFiles,
  filterProductDeltaSpecs,
  getProductDeltaScope,
  isProductDeltaPath,
} from '../ProductDeltaContract';""",
    """import {
  bindFeatureChecklistTargetsToProductDeltaPlan,
  filterProductDeltaFiles,
  filterProductDeltaSpecs,
  getProductDeltaScope,
  isProductDeltaPath,
} from '../ProductDeltaContract';""",
    'ProductDelta test import',
)
new_tests = r'''

  it('rebinds stale reusable-document targets to the current compiled delta plan', () => {
    const result = bindFeatureChecklistTargetsToProductDeltaPlan(
      'landing-page',
      [
        { targetFiles: ['pages/Hero.tsx', 'pages/PrimaryCta.tsx'] },
        { targetFiles: ['src/App.tsx', 'pages/Legacy.tsx'] },
      ],
      [
        { path: 'src/App.tsx' },
        { path: 'config/app.ts' },
        { path: 'data/content.ts' },
      ],
    );

    expect(result.map(item => item.targetFiles)).toEqual([
      ['App.tsx'],
      ['App.tsx'],
    ]);
  });

  it('preserves planned screen targets and never promotes an unplanned file', () => {
    const result = bindFeatureChecklistTargetsToProductDeltaPlan(
      'mobile-app',
      [
        { targetFiles: ['src/pages/Home.tsx', 'src/components/InventedCard.tsx'] },
        { targetFiles: ['src/App.tsx'] },
      ],
      [
        { path: 'src/pages/Home.tsx' },
        { path: 'src/data/seed.ts' },
      ],
    );

    expect(result[0].targetFiles).toEqual(['pages/Home.tsx']);
    expect(result[1].targetFiles).toEqual(['pages/Home.tsx']);
    expect(result.flatMap(item => item.targetFiles)).not.toContain('components/InventedCard.tsx');
    expect(result.flatMap(item => item.targetFiles)).not.toContain('App.tsx');
  });
'''
text = replace_once(text, '\n});\n', new_tests + '\n});\n', 'ProductDelta test describe end')
p.write_text(text)


# Live Canary fixture: make the product contract semantically true, not merely gate-compatible.
p = Path('e2e/chat-generation-flow.spec.cjs')
text = p.read_text()
text = replace_once(
    text,
    """  \"  primaryCtaLabel: 'Increment',\",
  \"  primaryCtaHref: '#counter',\",
  \"  secondaryCtaLabel: 'Show product proof',\",
  \"  secondaryCtaHref: '#product-proof',\",""",
    """  \"  primaryCtaLabel: 'Show product proof',\",
  \"  primaryCtaHref: '#product-proof',\",
  \"  secondaryCtaLabel: 'Increment',\",
  \"  secondaryCtaHref: '#counter',\",""",
    'canary CTA config',
)
old_app = r'''const LIVE_CANARY_PRODUCT_DELTA_APP_TSX = [
  "import { useState } from 'react';",
  "import { APP_CONFIG } from './config/app';",
  "import { CONTENT } from './data/content';",
  '',
  'type PreviewTab = keyof typeof CONTENT.previewPanels;',
  '',
  'export default function App() {',
  '  const [count, setCount] = useState(0);',
  '  const [proofVisible, setProofVisible] = useState(false);',
  "  const [activePreviewTab, setActivePreviewTab] = useState<PreviewTab>('overview');",
  '  return (',
  '    <main className="min-h-screen bg-background text-foreground grid place-items-center p-6">',
  '      <section data-testid="live-canary-surface" className="w-full max-w-2xl grid gap-5">',
  '        <header className="grid gap-3 rounded-2xl border border-border bg-card p-5">',
  '          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{CONTENT.eyebrow}</p>',
  '          <h1 className="text-4xl font-bold">{CONTENT.title}</h1>',
  '          <p className="text-muted-foreground">{CONTENT.description}</p>',
  '          <div className="flex flex-wrap gap-3">',
  '            <button type="button" onClick={() => setCount(value => value + 1)} className="rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground">{APP_CONFIG.primaryCtaLabel}</button>',
  '            <button type="button" onClick={() => setProofVisible(true)} className="rounded-lg border border-border bg-secondary px-4 py-3 font-semibold text-secondary-foreground">{APP_CONFIG.secondaryCtaLabel}</button>',
  '          </div>',
  '        </header>',
  '        <section id="counter" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">',
  '          <span className="text-muted-foreground">Current count</span>',
  '          <strong data-testid="count-value" className="text-4xl">{count}</strong>',
  '        </section>',
  '        {proofVisible ? (',
  '          <section id="product-proof" aria-label="Product preview" className="grid gap-3 rounded-2xl border border-border bg-muted p-4">',
  '            <div role="tablist" aria-label="Preview states" className="flex flex-wrap gap-2">',
  '              {(Object.keys(CONTENT.previewPanels) as PreviewTab[]).map(tabId => (',
  '                <button key={tabId} type="button" role="tab" aria-selected={activePreviewTab === tabId} onClick={() => setActivePreviewTab(tabId)} className={activePreviewTab === tabId ? "rounded-lg bg-primary px-3 py-2 text-primary-foreground" : "rounded-lg bg-card px-3 py-2 text-foreground"}>{tabId}</button>',
  '              ))}',
  '            </div>',
  '            <p data-testid="product-preview-panel" className="text-foreground">{CONTENT.previewPanels[activePreviewTab]}</p>',
  '          </section>',
  '        ) : (',
  '          <p className="text-muted-foreground">Product proof is ready. Use the secondary action to reveal it.</p>',
  '        )}',
  '        <ul id="status" className="grid gap-1 pl-5 text-muted-foreground list-disc">',
  '          {CONTENT.status.map(item => <li key={item}>{item}</li>)}',
  '        </ul>',
  '      </section>',
  '    </main>',
  '  );',
  '}',
  '',
].join('\n');'''
new_app = r'''const LIVE_CANARY_PRODUCT_DELTA_APP_TSX = [
  "import { useRef, useState } from 'react';",
  "import { APP_CONFIG } from './config/app';",
  "import { CONTENT } from './data/content';",
  '',
  'type PreviewTab = keyof typeof CONTENT.previewPanels;',
  '',
  'export default function App() {',
  '  const [count, setCount] = useState(0);',
  '  const [proofVisible, setProofVisible] = useState(false);',
  "  const [activePreviewTab, setActivePreviewTab] = useState<PreviewTab>('overview');",
  '  const proofRef = useRef<HTMLElement | null>(null);',
  '  const showProductProof = () => {',
  '    setProofVisible(true);',
  "    proofRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });",
  '  };',
  '  return (',
  '    <main className="min-h-screen bg-background text-foreground grid place-items-center p-6">',
  '      <section data-testid="live-canary-surface" className="w-full max-w-2xl grid gap-5">',
  '        <header className="grid gap-3 rounded-2xl border border-border bg-card p-5">',
  '          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{CONTENT.eyebrow}</p>',
  '          <h1 className="text-4xl font-bold">{CONTENT.title}</h1>',
  '          <p className="text-muted-foreground">{CONTENT.description}</p>',
  '          <div className="flex flex-wrap gap-3">',
  '            <button type="button" onClick={showProductProof} className="rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground">{APP_CONFIG.primaryCtaLabel}</button>',
  '            <button type="button" onClick={() => setCount(value => value + 1)} className="rounded-lg border border-border bg-secondary px-4 py-3 font-semibold text-secondary-foreground">{APP_CONFIG.secondaryCtaLabel}</button>',
  '          </div>',
  '        </header>',
  '        <section id="counter" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">',
  '          <span className="text-muted-foreground">Current count</span>',
  '          <strong data-testid="count-value" className="text-4xl">{count}</strong>',
  '        </section>',
  '        <section ref={proofRef} id="product-proof" aria-label="Product preview" className="grid gap-3 rounded-2xl border border-border bg-muted p-4">',
  '          {proofVisible ? (',
  '            <>',
  '              <div role="tablist" aria-label="Preview states" className="flex flex-wrap gap-2">',
  '                {(Object.keys(CONTENT.previewPanels) as PreviewTab[]).map(tabId => (',
  '                  <button key={tabId} type="button" role="tab" aria-selected={activePreviewTab === tabId} onClick={() => setActivePreviewTab(tabId)} className={activePreviewTab === tabId ? "rounded-lg bg-primary px-3 py-2 text-primary-foreground" : "rounded-lg bg-card px-3 py-2 text-foreground"}>{tabId}</button>',
  '                ))}',
  '              </div>',
  '              <p data-testid="product-preview-panel" className="text-foreground">{CONTENT.previewPanels[activePreviewTab]}</p>',
  '            </>',
  '          ) : (',
  '            <p className="text-muted-foreground">Product proof is ready. Use the primary action to reveal it.</p>',
  '          )}',
  '        </section>',
  '        <ul id="status" className="grid gap-1 pl-5 text-muted-foreground list-disc">',
  '          {CONTENT.status.map(item => <li key={item}>{item}</li>)}',
  '        </ul>',
  '      </section>',
  '    </main>',
  '  );',
  '}',
  '',
].join('\n');'''
text = replace_once(text, old_app, new_app, 'canary product delta app')
p.write_text(text)

print('stage4 checklist binding patch applied')
