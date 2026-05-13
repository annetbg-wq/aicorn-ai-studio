/* @jsxRuntime classic */
import React from 'react';
import PremiumMobileProgressCard01 from '../mobile/premium-mobile-progress-card-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-mobile-progress-card-01',
  category: 'mobile',
  skeletons: ["mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-mobile-progress-card-01">
      <PremiumMobileProgressCard01 testId="component-premium-mobile-progress-card-01" />
    </PremiumPreviewFrame>
  );
}
