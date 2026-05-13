/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-health-progress-ring-01",
  "layout": "progressRing",
  "title": "Recovery score",
  "subtitle": "A soft progress ring with reassuring context.",
  "chips": [
    "Improving"
  ],
  "items": [
    "Sleep",
    "Hydration",
    "Stress"
  ],
  "accent": "78%"
};

    export function PremiumHealthProgressRing01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumHealthProgressRing01;
