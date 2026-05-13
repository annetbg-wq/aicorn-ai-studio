/* @jsxRuntime classic */
import React from 'react';
import PremiumLandingPricing01 from '../landing/premium-landing-pricing-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-landing-pricing-01',
  category: 'landing',
  skeletons: ["landing-page"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-landing-pricing-01">
      <PremiumLandingPricing01 testId="component-premium-landing-pricing-01" />
    </PremiumPreviewFrame>
  );
}
