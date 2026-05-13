/* @jsxRuntime classic */
import React from 'react';
import PremiumMobileOnboarding01 from '../mobile/premium-mobile-onboarding-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-mobile-onboarding-01',
  category: 'mobile',
  skeletons: ["mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-mobile-onboarding-01">
      <PremiumMobileOnboarding01 testId="component-premium-mobile-onboarding-01" />
    </PremiumPreviewFrame>
  );
}
