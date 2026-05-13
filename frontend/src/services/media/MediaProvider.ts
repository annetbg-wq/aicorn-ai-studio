import { createGeneratedMediaBundle, type GeneratedMediaBundle } from './GeneratedMediaStore';
import type { MediaRequest } from './MediaPromptBuilder';
import type { GeneratedMediaAsset } from './MediaAssetManifestService';

export interface MediaProvider {
  generateImage(request: MediaRequest): Promise<GeneratedMediaBundle>;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function placeholderSvg(request: MediaRequest): string {
  const title = request.type.replace(/-/g, ' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" fill="none">
  <rect width="1200" height="800" rx="48" fill="var(--vb-surface, #111827)"/>
  <rect x="64" y="64" width="1072" height="672" rx="36" fill="var(--vb-bg, #0f172a)" stroke="var(--vb-border, #334155)"/>
  <circle cx="250" cy="220" r="120" fill="var(--vb-accent, #7c3aed)" fill-opacity="0.18"/>
  <circle cx="910" cy="520" r="160" fill="var(--vb-accent, #7c3aed)" fill-opacity="0.12"/>
  <text x="96" y="152" fill="var(--vb-text, #f8fafc)" font-size="42" font-family="Inter, Arial, sans-serif">${title}</text>
  <text x="96" y="208" fill="var(--vb-text-muted, #cbd5e1)" font-size="24" font-family="Inter, Arial, sans-serif">${request.targetScreen} → ${request.targetSlot}</text>
  <text x="96" y="272" fill="var(--vb-text-muted, #cbd5e1)" font-size="18" font-family="Inter, Arial, sans-serif">${request.style}</text>
  <rect x="96" y="340" width="420" height="220" rx="28" fill="var(--vb-surface, #111827)" stroke="var(--vb-border, #334155)"/>
  <rect x="548" y="340" width="556" height="28" rx="14" fill="var(--vb-border, #334155)"/>
  <rect x="548" y="392" width="428" height="20" rx="10" fill="var(--vb-border, #334155)"/>
  <rect x="548" y="436" width="520" height="20" rx="10" fill="var(--vb-border, #334155)"/>
  <rect x="548" y="490" width="220" height="56" rx="28" fill="var(--vb-accent, #7c3aed)" fill-opacity="0.24"/>
</svg>`;
}

export class LocalPlaceholderMediaProvider implements MediaProvider {
  async generateImage(request: MediaRequest): Promise<GeneratedMediaBundle> {
    const id = `${request.id}-${slug(request.type)}`;
    const assetPath = `src/assets/generated/${id}.svg`;
    const asset: GeneratedMediaAsset = {
      id,
      type: request.type,
      prompt: request.prompt,
      provider: 'local-placeholder',
      assetPath,
      usedInFiles: [],
      targetScreen: request.targetScreen,
      targetSlot: request.targetSlot,
      fallbackUsed: true,
      safetyNotes: request.safetyConstraints,
    };
    return createGeneratedMediaBundle(asset, placeholderSvg(request));
  }
}
