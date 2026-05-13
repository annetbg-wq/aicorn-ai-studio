/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-primitives-button-outline-01",
  "layout": "button",
  "title": "Watch demo",
  "subtitle": "Secondary action for supporting flows",
  "chips": [
    "Neutral"
  ],
  "items": [
    "Works in dark and light themes"
  ],
  "accent": "Demo"
};

    export function PremiumPrimitivesButtonOutline01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumPrimitivesButtonOutline01;
