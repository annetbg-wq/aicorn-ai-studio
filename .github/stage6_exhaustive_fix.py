from pathlib import Path

ROOT = Path('.')

def patch(path, old, new):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'missing in {path}: {old}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

f='frontend/src/services/FileVisualBankService.ts'
patch(f, "const PACK_DOMAIN_ALIASES: Record<SkeletonId, string[]> = {\n  'mobile-app':", "const PACK_DOMAIN_ALIASES: Record<SkeletonId, string[]> = {\n  'super-app':                ['consumer', 'wellness', 'health', 'fintech', 'learning', 'lifestyle'],\n  'mobile-app':")
patch(f, "  switch (skeleton) {\n    case 'mobile-app': return ['bottom-tabs', 'card-feed', 'list-detail', 'onboarding-flow', 'bottom-sheet', 'profile-stack'];", "  switch (skeleton) {\n    case 'super-app': return ['bottom-tabs', 'domain-hub', 'multi-domain-home', 'card-feed', 'onboarding-flow', 'profile-stack'];\n    case 'mobile-app': return ['bottom-tabs', 'card-feed', 'list-detail', 'onboarding-flow', 'bottom-sheet', 'profile-stack'];")
patch(f, "  switch (skeleton) {\n    case 'mobile-app': return ['mobile-nav', 'feed-item', 'onboarding-step', 'profile-card', 'bottom-sheet', 'card', 'list-item'];", "  switch (skeleton) {\n    case 'super-app': return ['mobile-nav', 'domain-card', 'feed-item', 'onboarding-step', 'profile-card', 'card', 'list-item'];\n    case 'mobile-app': return ['mobile-nav', 'feed-item', 'onboarding-step', 'profile-card', 'bottom-sheet', 'card', 'list-item'];")
patch(f, "  switch (skeleton) {\n    case 'mobile-app': return ['consumer-mobile', 'habit-tracking', 'wellness', 'women-health', 'nutrition'];", "  switch (skeleton) {\n    case 'super-app': return ['consumer-mobile', 'multi-domain', 'budgeting', 'wellness', 'learning'];\n    case 'mobile-app': return ['consumer-mobile', 'habit-tracking', 'wellness', 'women-health', 'nutrition'];")
patch(f, "  switch (skeleton) {\n    case 'mobile-app': return 'consumer-trust';", "  switch (skeleton) {\n    case 'super-app': return 'consumer-trust';\n    case 'mobile-app': return 'consumer-trust';")
patch('frontend/src/services/__tests__/AppFirstPrototypeQualityIntegration.test.ts', "      profile: 'mobile-app',", "      profile: 'app-first',")

for temp in ['.github/stage6_exhaustive_fix.py', '.github/workflows/stage6-exhaustive-fix.yml']:
    p=ROOT/temp
    if p.exists(): p.unlink()
print('fixed')
