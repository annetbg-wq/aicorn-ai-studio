/* @jsxRuntime classic */
import React from 'react';
import PremiumPrimitivesButtonGradient01 from '../primitives/premium-primitives-button-gradient-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-primitives-button-gradient-01',
  category: 'primitives',
  skeletons: ["landing-page", "saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-primitives-button-gradient-01">
      <PremiumPrimitivesButtonGradient01 testId="component-premium-primitives-button-gradient-01" />
    </PremiumPreviewFrame>
  );
}
