/* @jsxRuntime classic */
import React from 'react';
import PremiumSocialCreatorCard01 from '../social/premium-social-creator-card-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-social-creator-card-01',
  category: 'social',
  skeletons: ["social-community", "landing-page"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-social-creator-card-01">
      <PremiumSocialCreatorCard01 testId="component-premium-social-creator-card-01" />
    </PremiumPreviewFrame>
  );
}
