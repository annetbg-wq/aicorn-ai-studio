/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-mobile-profile-card-01",
  "layout": "paywallCard",
  "title": "Upgrade for deeper insights",
  "subtitle": "Profile-style premium card with plan benefits.",
  "chips": [
    "Pro plan"
  ],
  "items": [
    "Unlimited sessions",
    "Priority support",
    "Advanced analytics"
  ],
  "accent": "Upgrade"
};

    export function PremiumMobileProfileCard01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumMobileProfileCard01;
