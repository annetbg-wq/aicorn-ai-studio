/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-ecommerce-checkout-summary-01",
  "layout": "checkoutSummary",
  "title": "Checkout summary",
  "subtitle": "Transparent totals for a premium storefront.",
  "chips": [
    "Secure payment"
  ],
  "items": [
    "Subtotal $248",
    "Shipping $0",
    "Tax $18"
  ],
  "accent": "$266"
};

    export function PremiumEcommerceCheckoutSummary01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumEcommerceCheckoutSummary01;
