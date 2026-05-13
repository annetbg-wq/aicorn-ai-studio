/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-primitives-card-feature-01",
  "layout": "card",
  "title": "Shared workspace intelligence",
  "subtitle": "Bring product, ops, and support into one command center.",
  "chips": [
    "Realtime",
    "Insights"
  ],
  "items": [
    "Actionable alerts",
    "Narrated changes",
    "Safe defaults"
  ],
  "accent": "Insight"
};

    export function PremiumPrimitivesCardFeature01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumPrimitivesCardFeature01;
