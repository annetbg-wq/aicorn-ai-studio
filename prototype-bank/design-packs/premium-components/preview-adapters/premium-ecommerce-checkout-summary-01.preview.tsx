/* @jsxRuntime classic */
import React from 'react';
import PremiumEcommerceCheckoutSummary01 from '../ecommerce/premium-ecommerce-checkout-summary-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-ecommerce-checkout-summary-01',
  category: 'ecommerce',
  skeletons: ["ecommerce"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-ecommerce-checkout-summary-01">
      <PremiumEcommerceCheckoutSummary01 testId="component-premium-ecommerce-checkout-summary-01" />
    </PremiumPreviewFrame>
  );
}
