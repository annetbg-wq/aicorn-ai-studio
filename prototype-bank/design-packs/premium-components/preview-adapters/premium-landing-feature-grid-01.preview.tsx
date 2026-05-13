/* @jsxRuntime classic */
import React from 'react';
import PremiumLandingFeatureGrid01 from '../landing/premium-landing-feature-grid-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-landing-feature-grid-01',
  category: 'landing',
  skeletons: ["landing-page"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-landing-feature-grid-01">
      <PremiumLandingFeatureGrid01 testId="component-premium-landing-feature-grid-01" />
    </PremiumPreviewFrame>
  );
}
