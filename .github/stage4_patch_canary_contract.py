from pathlib import Path

path = Path('e2e/chat-generation-flow.spec.cjs')
text = path.read_text(encoding='utf-8')

if 'const LIVE_CANARY_REPAIRED_CONTENT_TS = [' not in text:
    marker = "const LIVE_CANARY_PRODUCT_DELTA_APP_TSX = ["
    if marker not in text:
        raise SystemExit('product delta App marker not found')
    repaired = r'''const LIVE_CANARY_REPAIRED_CONTENT_TS = [
  "import { Gauge, ShieldCheck, Zap, type LucideIcon } from 'lucide-react';",
  '',
  "export const NAV_LINKS = [",
  "  { href: '#product-proof', label: 'Product proof' },",
  "  { href: '#counter', label: 'Counter' },",
  "  { href: '#pricing', label: 'Plans' },",
  "  { href: '#faq', label: 'FAQ' },",
  "] as const;",
  '',
  "export const SOCIAL_PROOF_LOGOS = ['Candidate', 'Compile', 'Promotion', 'Preview'] as const;",
  '',
  'interface Feature { icon: LucideIcon; title: string; body: string }',
  'export const FEATURES: readonly Feature[] = [',
  "  { icon: Zap, title: 'Fast feedback', body: 'A small product delta moves through the real generation path.' },",
  "  { icon: Gauge, title: 'Observable release', body: 'Each pipeline stage exposes a concrete readiness signal.' },",
  "  { icon: ShieldCheck, title: 'Contract safe', body: 'Locked skeleton modules keep their required import contract.' },",
  '] as const;',
  '',
  'export const STEPS = [',
  "  { number: '01', title: 'Generate', body: 'Produce only declared product slots.' },",
  "  { number: '02', title: 'Compile', body: 'Assemble those slots over the unchanged skeleton.' },",
  "  { number: '03', title: 'Promote', body: 'Release preview ownership only after final checks pass.' },",
  '] as const;',
  '',
  'export const PRICING = [',
  "  { name: 'Canary', monthly: 0, annual: 0, description: 'A deterministic release check.', features: ['Product delta', 'Live contract', 'Preview promotion'], cta: 'Run canary' },",
  "  { name: 'Continuous', monthly: 29, annual: 24, highlight: true, description: 'Repeated validation for active development.', features: ['Regression checks', 'Preview smoke', 'Release evidence'], cta: 'Keep validating' },",
  '] as const;',
  '',
  'export const FAQ = [',
  "  { q: 'What does this prove?', a: 'That generated product slots can compile and render over the unchanged skeleton.' },",
  "  { q: 'Does the agent rewrite the skeleton?', a: 'No. Generation remains constrained to the compiled product-slot allow-list.' },",
  '] as const;',
  '',
  'export const FOOTER_COLUMNS = [',
  "  { heading: 'Pipeline', links: [{ href: '#product-proof', label: 'Product proof' }, { href: '#counter', label: 'Counter' }] },",
  "  { heading: 'Release', links: [{ href: '#pricing', label: 'Plans' }, { href: '#faq', label: 'FAQ' }] },",
  '] as const;',
  '',
  'export const CONTENT = {',
  "  eyebrow: 'Live preview canary',",
  "  title: 'Counter ready',",
  "  description: 'A deterministic product delta that proves generation, compilation, interaction, and preview promotion.',",
  '  previewPanels: {',
  "    overview: 'Candidate materialized and compiled.',",
  "    interaction: 'Interactive state survives the generated revision.',",
  "    release: 'Final live check can release preview ownership.',",
  '  },',
  "  status: ['Candidate materialized', 'Compiled preview mounted', 'Final live check passed'],",
  '} as const;',
  '',
].join('\\n');

'''
    text = text.replace(marker, repaired + marker, 1)

old = r'''const LIVE_CANARY_QUALITY_REPAIR_RESPONSE = [
  `<<<FILE: App.tsx>>>\n${LIVE_CANARY_PRODUCT_DELTA_APP_TSX}\n<<<END>>>`,
].join('\n');'''
new = r'''const LIVE_CANARY_QUALITY_REPAIR_RESPONSE = [
  `<<<FILE: App.tsx>>>\n${LIVE_CANARY_PRODUCT_DELTA_APP_TSX}\n<<<END>>>`,
  `<<<FILE: data/content.ts>>>\n${LIVE_CANARY_REPAIRED_CONTENT_TS}\n<<<END>>>`,
].join('\n');'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('quality repair response anchor not found')

path.write_text(text, encoding='utf-8')
