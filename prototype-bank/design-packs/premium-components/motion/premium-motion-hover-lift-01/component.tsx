/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-motion-hover-lift-01",
  "layout": "revealCard",
  "title": "Lift tile",
  "subtitle": "Gentle hover effect for premium cards.",
  "chips": [
    "Subtle"
  ],
  "items": [
    "Scale",
    "Glow",
    "Shadow"
  ],
  "accent": "Lift"
};

    export function PremiumMotionHoverLift01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumMotionHoverLift01;
