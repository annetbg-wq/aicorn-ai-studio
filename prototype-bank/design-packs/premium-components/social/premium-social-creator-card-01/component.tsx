/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-social-creator-card-01",
  "layout": "creatorCard",
  "title": "Featured creator",
  "subtitle": "A polished spotlight card for communities.",
  "chips": [
    "AI design"
  ],
  "items": [
    "12 premium packs",
    "Weekly breakdowns",
    "Mentor office hours"
  ],
  "accent": "Subscribe"
};

    export function PremiumSocialCreatorCard01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumSocialCreatorCard01;
