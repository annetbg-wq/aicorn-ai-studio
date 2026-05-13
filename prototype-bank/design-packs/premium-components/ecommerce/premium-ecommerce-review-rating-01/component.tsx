/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-ecommerce-review-rating-01",
  "layout": "reviewBlock",
  "title": "What buyers love",
  "subtitle": "Structured review proof with premium tone.",
  "chips": [
    "4.9 average"
  ],
  "items": [
    "\u201cBeautiful finish and fast setup.\u201d",
    "\u201cFeels premium on day one.\u201d"
  ],
  "accent": "4.9"
};

    export function PremiumEcommerceReviewRating01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumEcommerceReviewRating01;
