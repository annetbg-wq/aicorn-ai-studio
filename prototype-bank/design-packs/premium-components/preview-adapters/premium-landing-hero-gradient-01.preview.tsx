/* @jsxRuntime classic */
import React from 'react';
import PremiumLandingHeroGradient01 from '../landing/premium-landing-hero-gradient-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-landing-hero-gradient-01',
  category: 'landing',
  skeletons: ["landing-page", "saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-landing-hero-gradient-01">
      <PremiumLandingHeroGradient01 testId="component-premium-landing-hero-gradient-01" />
    </PremiumPreviewFrame>
  );
}
