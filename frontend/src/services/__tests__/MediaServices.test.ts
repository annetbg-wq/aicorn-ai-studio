import { describe, expect, it } from 'vitest';
import { resolveMediaIntent } from '../media/MediaIntentService';
import { LocalPlaceholderMediaProvider } from '../media/MediaProvider';
import { validateGeneratedMediaUsage, buildMediaManifest } from '../media/MediaAssetManifestService';

describe('media services', () => {
  it('derives media intent for landing, ecommerce, onboarding, and explicit media requests', () => {
    const landing = resolveMediaIntent({ brief: 'Premium SaaS landing page with hero visual', skeleton: 'landing-page', domain: 'saas' });
    expect(landing.mediaNeeded).toBe(true);
    expect(landing.mediaRequests.some(request => request.type === 'hero-image')).toBe(true);

    const ecommerce = resolveMediaIntent({ brief: 'Ecommerce checkout and product detail flow', skeleton: 'ecommerce', domain: 'ecommerce' });
    expect(ecommerce.mediaRequests.some(request => request.type === 'product-mockup')).toBe(true);

    const onboarding = resolveMediaIntent({ brief: 'Mobile onboarding flow for a consumer app', skeleton: 'mobile-app', domain: 'consumer' });
    expect(onboarding.mediaRequests.some(request => request.type === 'onboarding-illustration')).toBe(true);

    const explicit = resolveMediaIntent({ brief: 'Dashboard app', skeleton: 'saas-dashboard', domain: 'saas', userExplicitMediaRequest: true });
    expect(explicit.mediaNeeded).toBe(true);
    expect(explicit.reason).toMatch(/explicitly requested media/i);
  });

  it('creates a local fallback asset bundle and media-manifest when no external API key is configured', async () => {
    const provider = new LocalPlaceholderMediaProvider();
    const request = resolveMediaIntent({ brief: 'Premium SaaS landing page with hero visual', skeleton: 'landing-page', domain: 'saas' }).mediaRequests[0];
    const bundle = await provider.generateImage(request);

    expect(bundle.asset.fallbackUsed).toBe(true);
    expect(bundle.asset.assetPath).toMatch(/^src\/assets\/generated\/.+\.svg$/);
    expect(bundle.files[bundle.asset.assetPath]).toContain('<svg');
    expect(bundle.files['src/assets/generated/media-manifest.json']).toContain(bundle.asset.id);
  });

  it('flags remote image URLs and unused generated media', () => {
    const manifest = buildMediaManifest([
      {
        id: 'asset-1',
        type: 'hero-image',
        prompt: 'hero',
        provider: 'local-placeholder',
        assetPath: 'src/assets/generated/asset-1.svg',
        usedInFiles: [],
        targetScreen: 'landing-page',
        targetSlot: 'hero-visual',
        fallbackUsed: true,
        safetyNotes: [],
      },
    ]);

    const badResult = validateGeneratedMediaUsage(
      {
        'src/App.tsx': 'export default function App(){ return <img src="https://images.unsplash.com/photo-1" />; }',
      },
      manifest,
    );
    expect(badResult.ok).toBe(false);
    expect(badResult.remoteUrlViolations).toHaveLength(1);
    expect(badResult.unusedAssets).toContain('asset-1');

    const okResult = validateGeneratedMediaUsage(
      {
        'src/App.tsx': 'export default function App(){ return <img src="src/assets/generated/asset-1.svg" />; }',
      },
      manifest,
    );
    expect(okResult.ok).toBe(true);
  });
});
