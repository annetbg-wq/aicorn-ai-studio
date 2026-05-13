/* @jsxRuntime classic */
import React from 'react';
import PremiumEcommerceReviewRating01 from '../ecommerce/premium-ecommerce-review-rating-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-ecommerce-review-rating-01',
  category: 'ecommerce',
  skeletons: ["ecommerce"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-ecommerce-review-rating-01">
      <PremiumEcommerceReviewRating01 testId="component-premium-ecommerce-review-rating-01" />
    </PremiumPreviewFrame>
  );
}
