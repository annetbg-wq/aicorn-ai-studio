/* @jsxRuntime classic */
import React from 'react';
import PremiumMobileProfileCard01 from '../mobile/premium-mobile-profile-card-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-mobile-profile-card-01',
  category: 'mobile',
  skeletons: ["mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-mobile-profile-card-01">
      <PremiumMobileProfileCard01 testId="component-premium-mobile-profile-card-01" />
    </PremiumPreviewFrame>
  );
}
