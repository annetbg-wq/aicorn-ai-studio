/* @jsxRuntime classic */
import React from 'react';
import PremiumPrimitivesInputCommand01 from '../primitives/premium-primitives-input-command-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-primitives-input-command-01',
  category: 'primitives',
  skeletons: ["saas-dashboard", "mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-primitives-input-command-01">
      <PremiumPrimitivesInputCommand01 testId="component-premium-primitives-input-command-01" />
    </PremiumPreviewFrame>
  );
}
