/* @jsxRuntime classic */
import React from 'react';
import PremiumPrimitivesBadgeChip01 from '../primitives/premium-primitives-badge-chip-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-primitives-badge-chip-01',
  category: 'primitives',
  skeletons: ["saas-dashboard", "mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-primitives-badge-chip-01">
      <PremiumPrimitivesBadgeChip01 testId="component-premium-primitives-badge-chip-01" />
    </PremiumPreviewFrame>
  );
}
