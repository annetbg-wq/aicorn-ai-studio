/* @jsxRuntime classic */
import React from 'react';
import PremiumLandingCta01 from '../landing/premium-landing-cta-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-landing-cta-01',
  category: 'landing',
  skeletons: ["landing-page"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-landing-cta-01">
      <PremiumLandingCta01 testId="component-premium-landing-cta-01" />
    </PremiumPreviewFrame>
  );
}
