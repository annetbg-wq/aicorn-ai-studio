/* @jsxRuntime classic */
import React from 'react';
import PremiumPrimitivesButtonOutline01 from '../primitives/premium-primitives-button-outline-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-primitives-button-outline-01',
  category: 'primitives',
  skeletons: ["landing-page", "ecommerce", "social-community"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-primitives-button-outline-01">
      <PremiumPrimitivesButtonOutline01 testId="component-premium-primitives-button-outline-01" />
    </PremiumPreviewFrame>
  );
}
