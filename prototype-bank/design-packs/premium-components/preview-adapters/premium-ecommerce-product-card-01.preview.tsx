/* @jsxRuntime classic */
import React from 'react';
import PremiumEcommerceProductCard01 from '../ecommerce/premium-ecommerce-product-card-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-ecommerce-product-card-01',
  category: 'ecommerce',
  skeletons: ["ecommerce"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-ecommerce-product-card-01">
      <PremiumEcommerceProductCard01 testId="component-premium-ecommerce-product-card-01" />
    </PremiumPreviewFrame>
  );
}
