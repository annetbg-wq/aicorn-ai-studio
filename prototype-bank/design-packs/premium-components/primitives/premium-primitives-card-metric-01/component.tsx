/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-primitives-card-metric-01",
  "layout": "card",
  "title": "Net retention",
  "subtitle": "118% versus last month",
  "chips": [
    "+12%"
  ],
  "items": [
    "Healthy expansion",
    "Churn down"
  ],
  "accent": "118%"
};

    export function PremiumPrimitivesCardMetric01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumPrimitivesCardMetric01;
