/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-primitives-button-gradient-01",
  "layout": "button",
  "title": "Start free",
  "subtitle": "Primary action with soft gradient emphasis",
  "chips": [
    "Fast setup",
    "No credit card"
  ],
  "items": [
    "Deploy in minutes",
    "Share with your team"
  ],
  "accent": "Launch"
};

    export function PremiumPrimitivesButtonGradient01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumPrimitivesButtonGradient01;
