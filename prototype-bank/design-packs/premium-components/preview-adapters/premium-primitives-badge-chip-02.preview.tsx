/* @jsxRuntime classic */
import React from 'react';
import PremiumPrimitivesBadgeChip02 from '../primitives/premium-primitives-badge-chip-02/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-primitives-badge-chip-02',
  category: 'primitives',
  skeletons: ["landing-page", "social-community"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-primitives-badge-chip-02">
      <PremiumPrimitivesBadgeChip02 testId="component-premium-primitives-badge-chip-02" />
    </PremiumPreviewFrame>
  );
}
