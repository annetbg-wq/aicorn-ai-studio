/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-landing-cta-01",
  "layout": "cta",
  "title": "Bring premium product quality into every prompt",
  "subtitle": "Choose a recipe, inspect real files, and ship with a stronger starting point.",
  "chips": [
    "Recipe-aware"
  ],
  "items": [
    "Select blocks",
    "Review previews",
    "Generate safely"
  ],
  "accent": "Start building"
};

    export function PremiumLandingCta01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumLandingCta01;
