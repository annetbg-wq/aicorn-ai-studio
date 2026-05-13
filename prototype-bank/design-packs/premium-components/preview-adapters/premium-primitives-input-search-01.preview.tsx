/* @jsxRuntime classic */
import React from 'react';
import PremiumPrimitivesInputSearch01 from '../primitives/premium-primitives-input-search-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-primitives-input-search-01',
  category: 'primitives',
  skeletons: ["saas-dashboard", "ecommerce", "social-community"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-primitives-input-search-01">
      <PremiumPrimitivesInputSearch01 testId="component-premium-primitives-input-search-01" />
    </PremiumPreviewFrame>
  );
}
