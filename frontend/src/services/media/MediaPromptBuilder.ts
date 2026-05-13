export type MediaRequestType =
  | 'hero-image'
  | 'abstract-visual'
  | 'product-mockup'
  | 'avatar-set'
  | 'onboarding-illustration'
  | 'empty-state-illustration'
  | 'dashboard-preview'
  | 'background-texture'
  | 'feed-media'
  | 'calm-illustration'
  | 'profile-avatar'
  | 'device-preview';

export interface MediaRequest {
  id: string;
  type: MediaRequestType;
  targetScreen: string;
  targetSlot: string;
  quantity: number;
  style: string;
  safetyConstraints: string[];
  prompt: string;
}

export function buildMediaPrompt(request: Omit<MediaRequest, 'prompt'> & { brief: string; domain?: string | null }): MediaRequest {
  const domain = request.domain ? `${request.domain} ` : '';
  const safety = request.safetyConstraints.length > 0
    ? ` Safety constraints: ${request.safetyConstraints.join('; ')}.`
    : '';
  return {
    ...request,
    prompt: `Create a ${request.style} ${domain}${request.type.replace(/-/g, ' ')} for ${request.targetScreen} targeting the ${request.targetSlot} slot. Brief: ${request.brief}.${safety}`.trim(),
  };
}
