/* @jsxRuntime classic */
import React from 'react';
import PremiumEcommerceProductGrid01 from '../ecommerce/premium-ecommerce-product-grid-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-ecommerce-product-grid-01',
  category: 'ecommerce',
  skeletons: ["ecommerce"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-ecommerce-product-grid-01">
      <PremiumEcommerceProductGrid01 testId="component-premium-ecommerce-product-grid-01" />
    </PremiumPreviewFrame>
  );
}
