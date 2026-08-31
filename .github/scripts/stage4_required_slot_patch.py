from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f"{label} anchor mismatch: {text.count(old)}")
    return text.replace(old, new, 1)


# 1) Runtime: preserve the full coder context in the required-slot retry.
p = Path("frontend/src/services/ProtoPipeline.ts")
text = p.read_text()
old = r'''    const retrySystem = `${formatReminder}Same task as before. Emit ONLY the files listed below, in the FILE/END marker format. Do not repeat already-produced files.

MISSING FILES:
${missing.map(p => `  - ${p}`).join('\n')}`;'''
new = r'''    const retryTargetFiles = targetFiles.filter(file => missing.includes(file.path));
    const retryFileList = retryTargetFiles
      .map(file => `  - ${file.path}${file.purpose ? `  // ${file.purpose}` : ''}`)
      .join('\n');
    const retrySystem = [
      skeletonHeaderBlock,
      input.coderContractBrief ? `\n${input.coderContractBrief}` : '',
      contractBlock ? `\n${contractBlock}` : '',
      planningBlocks ? `\n${planningBlocks}` : '',
      `\n${skeletonPromptBlock}`,
      establishedFilesBlock ? `\n${establishedFilesBlock}` : '',
      `\nREQUIRED PRODUCT-SLOT RECOVERY\n` +
        `${formatReminder}` +
        `Your previous response omitted required product-slot file(s). ` +
        `This recovery succeeds ONLY if every path below is emitted exactly once.\n` +
        `Emit ONLY these missing files; do not repeat any file already accepted.\n\n` +
        `MISSING REQUIRED PRODUCT SLOTS:\n${retryFileList}`,
      `\n${outputFormatBlock}`,
      `\n${importRulesBlock}`,
      `\n${rulesBlock}`,
    ].join('\n');'''
text = replace_once(text, old, new, "coder retry")
p.write_text(text)


# 2) Live Preview Canary: use the actual landing product slots.
p = Path("e2e/chat-generation-flow.spec.cjs")
text = p.read_text()
anchor = "const LIVE_CANARY_PASS2_HERO_TSX = ["
if text.count(anchor) != 1:
    raise SystemExit("pass2 hero anchor mismatch")

product_delta_constants = r'''const LIVE_CANARY_CONTENT_TS = [
  'export const CONTENT = {',
  "  eyebrow: 'Live preview canary',",
  "  title: 'Counter ready',",
  "  description: 'A deterministic product delta that proves generation, compilation, interaction, and preview promotion.',",
  '  previewPanels: {',
  "    overview: 'Candidate materialized and compiled.',",
  "    interaction: 'Interactive state survives the generated revision.',",
  "    release: 'Final live check can release preview ownership.',",
  '  },',
  '  status: [',
  "    'Candidate materialized',",
  "    'Compiled preview mounted',",
  "    'Final live check passed',",
  '  ],',
  '} as const;',
  '',
].join('\\n');

const LIVE_CANARY_PRODUCT_DELTA_APP_TSX = [
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
].join('\\n');

'''
text = text.replace(anchor, product_delta_constants + anchor, 1)

text = replace_once(
    text,
    "  \"  secondaryCtaLabel: 'View status',\",\n  \"  secondaryCtaHref: '#status',\",",
    "  \"  secondaryCtaLabel: 'Show product proof',\",\n  \"  secondaryCtaHref: '#product-proof',\",",
    "secondary CTA",
)
text = replace_once(text, "    targetFile: 'pages/Hero.tsx',", "    targetFile: 'App.tsx',", "critic hero target")
text = replace_once(
    text,
    "    targetFile: 'pages/ProductPreviewOrWorkflowExplanation.tsx',",
    "    targetFile: 'App.tsx',",
    "critic preview target",
)

old = """const LIVE_CANARY_PASS2_IMPLEMENTER_RESPONSE = [
  `<<<FILE: src/App.tsx>>>\\n${LIVE_CANARY_PASS2_APP_TSX}\\n<<<END>>>`,
  `<<<FILE: src/pages/Hero.tsx>>>\\n${LIVE_CANARY_PASS2_HERO_TSX}\\n<<<END>>>`,
  `<<<FILE: src/pages/ProductPreviewOrWorkflowExplanation.tsx>>>\\n${LIVE_CANARY_PASS2_PREVIEW_TSX}\\n<<<END>>>`,
].join('\\n');"""
new = """const LIVE_CANARY_PASS2_IMPLEMENTER_RESPONSE = [
  `<<<FILE: src/App.tsx>>>\\n${LIVE_CANARY_PRODUCT_DELTA_APP_TSX}\\n<<<END>>>`,
].join('\\n');"""
text = replace_once(text, old, new, "pass2 implementer")

old = """const LIVE_CANARY_QUALITY_REPAIR_RESPONSE = [
  `<<<FILE: App.tsx>>>\\n${LIVE_CANARY_QUALITY_APP_TSX}\\n<<<END>>>`,
  `<<<FILE: pages/Hero.tsx>>>\\n${LIVE_CANARY_QUALITY_HERO_TSX}\\n<<<END>>>`,
  `<<<FILE: pages/ProductPreviewOrWorkflowExplanation.tsx>>>\\n${LIVE_CANARY_QUALITY_PREVIEW_TSX}\\n<<<END>>>`,
].join('\\n');"""
new = """const LIVE_CANARY_QUALITY_REPAIR_RESPONSE = [
  `<<<FILE: App.tsx>>>\\n${LIVE_CANARY_PRODUCT_DELTA_APP_TSX}\\n<<<END>>>`,
].join('\\n');"""
text = replace_once(text, old, new, "quality repair")

old = """    fileStructure: [
      { file: 'App.tsx', purpose: 'Render the counter canary surface' },
      { file: 'config/app.ts', purpose: 'Provide product identity for the landing skeleton' },
    ],"""
new = """    fileStructure: [
      { file: 'App.tsx', purpose: 'Render the counter canary surface inside the landing product slot' },
      { file: 'config/app.ts', purpose: 'Provide product identity for the landing skeleton' },
      { file: 'data/content.ts', purpose: 'Provide product copy, proof panels, and status content' },
    ],"""
text = replace_once(text, old, new, "tech file structure")

old = """      {
        path: 'src/App.tsx',
        content: LIVE_CANARY_APP_TSX,
      },
      {
        path: 'src/config/app.ts',
        content: LIVE_CANARY_APP_CONFIG_TS,
      },"""
new = """      {
        path: 'src/App.tsx',
        content: LIVE_CANARY_PRODUCT_DELTA_APP_TSX,
      },
      {
        path: 'src/config/app.ts',
        content: LIVE_CANARY_APP_CONFIG_TS,
      },
      {
        path: 'src/data/content.ts',
        content: LIVE_CANARY_CONTENT_TS,
      },"""
text = replace_once(text, old, new, "legacy coder artifact")

old = """  fileTree: {
    'src/App.tsx': 'Root app: renders the live canary counter surface with a visible section and increment button',
    'src/config/app.ts': 'Product identity: stable name and CTA metadata required by the landing skeleton',
  },"""
new = """  fileTree: {
    'src/App.tsx': 'Product slot: interactive counter, CTA-to-proof flow, and preview-state tabs',
    'src/config/app.ts': 'Product slot: stable name and CTA metadata required by the landing skeleton',
    'src/data/content.ts': 'Product slot: product copy, preview proof panels, and release status content',
  },"""
text = replace_once(text, old, new, "proto architect fileTree")

old = """const LIVE_CANARY_PROTO_CODER_PLAN = [
  `<<<FILE: src/App.tsx>>>\\n${LIVE_CANARY_APP_TSX}\\n<<<END>>>`,
  `<<<FILE: src/config/app.ts>>>\\n${LIVE_CANARY_APP_CONFIG_TS}\\n<<<END>>>`,
].join('\\n');"""
new = """const LIVE_CANARY_PROTO_CODER_PLAN = [
  `<<<FILE: src/App.tsx>>>\\n${LIVE_CANARY_PRODUCT_DELTA_APP_TSX}\\n<<<END>>>`,
  `<<<FILE: src/config/app.ts>>>\\n${LIVE_CANARY_APP_CONFIG_TS}\\n<<<END>>>`,
  `<<<FILE: src/data/content.ts>>>\\n${LIVE_CANARY_CONTENT_TS}\\n<<<END>>>`,
].join('\\n');"""
text = replace_once(text, old, new, "proto coder plan")

p.write_text(text)

print("stage4 required-slot patch applied")
