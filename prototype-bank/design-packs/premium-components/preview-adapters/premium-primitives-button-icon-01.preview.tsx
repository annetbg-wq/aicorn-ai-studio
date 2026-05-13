/* @jsxRuntime classic */
import React from 'react';
import PremiumPrimitivesButtonIcon01 from '../primitives/premium-primitives-button-icon-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-primitives-button-icon-01',
  category: 'primitives',
  skeletons: ["saas-dashboard", "mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-primitives-button-icon-01">
      <PremiumPrimitivesButtonIcon01 testId="component-premium-primitives-button-icon-01" />
    </PremiumPreviewFrame>
  );
}
