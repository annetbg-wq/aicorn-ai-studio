/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-motion-hover-reveal-01",
  "layout": "revealCard",
  "title": "Hover reveal",
  "subtitle": "Expressive spotlight card for premium discovery.",
  "chips": [
    "Hover"
  ],
  "items": [
    "Lift",
    "Fade",
    "Accent wash"
  ],
  "accent": "Reveal"
};

    export function PremiumMotionHoverReveal01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumMotionHoverReveal01;
