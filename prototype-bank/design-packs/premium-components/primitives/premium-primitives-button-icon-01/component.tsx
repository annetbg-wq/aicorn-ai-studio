/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-primitives-button-icon-01",
  "layout": "button",
  "title": "Share report",
  "subtitle": "Split action for collaborative workflows",
  "chips": [
    "Icon"
  ],
  "items": [
    "Primary plus shortcut affordance"
  ],
  "accent": "Share"
};

    export function PremiumPrimitivesButtonIcon01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumPrimitivesButtonIcon01;
