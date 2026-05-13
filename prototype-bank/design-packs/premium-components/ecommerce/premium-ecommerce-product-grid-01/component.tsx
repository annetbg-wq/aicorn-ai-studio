/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-ecommerce-product-grid-01",
  "layout": "productGrid",
  "title": "Curated best sellers",
  "subtitle": "Compact premium grid with inventory badges.",
  "chips": [
    "4 featured"
  ],
  "items": [
    "Desk lamp",
    "Leather folio",
    "Noise-free keyboard",
    "Travel mug"
  ],
  "accent": "Shop all"
};

    export function PremiumEcommerceProductGrid01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumEcommerceProductGrid01;
