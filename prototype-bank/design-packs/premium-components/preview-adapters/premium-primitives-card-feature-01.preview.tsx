/* @jsxRuntime classic */
import React from 'react';
import PremiumPrimitivesCardFeature01 from '../primitives/premium-primitives-card-feature-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-primitives-card-feature-01',
  category: 'primitives',
  skeletons: ["landing-page", "saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-primitives-card-feature-01">
      <PremiumPrimitivesCardFeature01 testId="component-premium-primitives-card-feature-01" />
    </PremiumPreviewFrame>
  );
}
