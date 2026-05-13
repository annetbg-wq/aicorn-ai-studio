/* @jsxRuntime classic */
import React from 'react';
import PremiumPrimitivesCardMetric01 from '../primitives/premium-primitives-card-metric-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-primitives-card-metric-01',
  category: 'primitives',
  skeletons: ["saas-dashboard", "health"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-primitives-card-metric-01">
      <PremiumPrimitivesCardMetric01 testId="component-premium-primitives-card-metric-01" />
    </PremiumPreviewFrame>
  );
}
