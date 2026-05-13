/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-ecommerce-product-card-01",
  "layout": "productCard",
  "title": "Signature workspace lamp",
  "subtitle": "Minimal product card with local media slot.",
  "chips": [
    "Free shipping"
  ],
  "items": [
    "Walnut finish",
    "Warm light",
    "2-year warranty"
  ],
  "accent": "$129"
};

    export function PremiumEcommerceProductCard01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumEcommerceProductCard01;
