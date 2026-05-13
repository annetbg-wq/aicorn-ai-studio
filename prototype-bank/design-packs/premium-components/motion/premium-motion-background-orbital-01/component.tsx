/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-motion-background-orbital-01",
  "layout": "animatedBackground",
  "title": "Orbital background",
  "subtitle": "Animated ambient backdrop for hero sections.",
  "chips": [
    "Motion"
  ],
  "items": [
    "Soft drift",
    "Token colors"
  ],
  "accent": "Orbit"
};

    export function PremiumMotionBackgroundOrbital01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumMotionBackgroundOrbital01;
