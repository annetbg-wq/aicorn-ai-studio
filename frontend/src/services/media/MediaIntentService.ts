import type { SkeletonId } from '../SkeletonRegistry';
import type { PremiumRecipeSchema } from '../PremiumComponentBankService';
import { buildMediaPrompt, type MediaRequest } from './MediaPromptBuilder';

export interface MediaIntentInput {
  brief: string;
  skeleton: SkeletonId;
  domain?: string | null;
  selectedComponentRecipe?: PremiumRecipeSchema | null;
  userExplicitMediaRequest?: boolean | string | null;
  targetSurfaces?: string[];
}

export interface MediaIntentResult {
  mediaNeeded: boolean;
  reason: string;
  mediaRequests: MediaRequest[];
  selectionReasons: string[];
}

function createRequest(
  id: string,
  type: MediaRequest['type'],
  targetScreen: string,
  targetSlot: string,
  style: string,
  brief: string,
  domain?: string | null,
  safetyConstraints: string[] = [],
): MediaRequest {
  return buildMediaPrompt({
    id,
    type,
    targetScreen,
    targetSlot,
    quantity: 1,
    style,
    safetyConstraints,
    brief,
    domain,
  });
}

export function resolveMediaIntent(input: MediaIntentInput): MediaIntentResult {
  const brief = input.brief.toLowerCase();
  const domain = (input.domain ?? '').toLowerCase();
  const recipe = input.selectedComponentRecipe ?? null;
  const explicit = Boolean(input.userExplicitMediaRequest);
  const requests: MediaRequest[] = [];
  const selectionReasons: string[] = [];
  const push = (request: MediaRequest, reason: string) => {
    requests.push(request);
    selectionReasons.push(reason);
  };

  if (explicit) {
    push(
      createRequest('explicit-hero', 'hero-image', input.skeleton, 'explicit-request', 'premium editorial', input.brief, input.domain),
      'selected because the brief explicitly requested media',
    );
  }

  if (input.skeleton === 'landing-page') {
    push(
      createRequest('landing-hero', 'hero-image', 'landing-page', 'hero-visual', 'premium product launch', input.brief, input.domain),
      'selected because media intent resolved for landing-page hero',
    );
    push(
      createRequest('landing-backdrop', 'abstract-visual', 'landing-page', 'background', 'ambient gradient', input.brief, input.domain),
      'selected because media intent resolved for landing-page background',
    );
    if (recipe?.mediaPolicy.types.includes('dashboard-preview')) {
      push(
        createRequest('landing-dashboard-preview', 'dashboard-preview', 'landing-page', 'dashboard-preview', 'clean glass dashboard', input.brief, input.domain),
        'selected because the premium recipe requests a dashboard preview asset',
      );
    }
  }

  if (input.skeleton === 'ecommerce' || /checkout|product|store|retail|catalog/.test(brief)) {
    push(
      createRequest('ecommerce-product', 'product-mockup', 'ecommerce', 'product-image', 'studio product photography', input.brief, input.domain),
      'selected because ecommerce/product imagery was detected in the brief',
    );
  }

  if (input.skeleton === 'mobile-app' && (/onboarding|welcome|first run/.test(brief) || recipe?.id === 'mobile-consumer-app')) {
    push(
      createRequest('mobile-onboarding', 'onboarding-illustration', 'mobile-app', 'onboarding-illustration', 'friendly mobile onboarding', input.brief, input.domain),
      'selected because mobile onboarding intent was detected',
    );
  }

  if (input.skeleton === 'social-community' || /social|community|creator|feed/.test(brief)) {
    push(
      createRequest('social-avatar-set', 'avatar-set', 'social-community', 'avatar-set', 'diverse premium avatars', input.brief, input.domain),
      'selected because social/community avatar usage was detected',
    );
    push(
      createRequest('social-feed-media', 'feed-media', 'social-community', 'feed-media', 'creator post visual', input.brief, input.domain),
      'selected because social/community feed media was detected',
    );
  }

  if ((input.skeleton === 'saas-dashboard' || input.skeleton === 'productivity-tool') && /dashboard|analytics|operator|metrics/.test(brief)) {
    push(
      createRequest('dashboard-preview', 'dashboard-preview', input.skeleton, 'dashboard-preview', 'clean operator console', input.brief, input.domain),
      'selected because dashboard/operator media intent was detected',
    );
  }

  if (recipe?.id === 'health-wellness-mobile' || /health|wellness|calm|clinic|patient|sleep/.test(brief) || ['health', 'wellness', 'medicine'].includes(domain)) {
    push(
      createRequest('health-calm', 'calm-illustration', 'mobile-app', 'calm-illustration', 'soft wellness illustration', input.brief, input.domain, [
        'Use calm, safe, non-medical-scare direction',
        'Avoid alarming emergency imagery',
      ]),
      'selected because health/wellness intent resolved for a calm illustration',
    );
  }

  const deduped = Array.from(new Map(requests.map(request => [request.id, request])).values());
  const dedupedReasons = Array.from(new Set(selectionReasons));
  const mediaNeeded = deduped.length > 0;
  const reason = explicit
    ? 'User explicitly requested media.'
    : mediaNeeded
      ? `Media is recommended for ${input.skeleton} based on the selected recipe and brief.`
      : 'No strong media requirement detected.';

  return { mediaNeeded, reason, mediaRequests: deduped, selectionReasons: dedupedReasons };
}
