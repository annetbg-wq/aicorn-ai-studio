/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-motion-background-grid-01",
  "layout": "animatedBackground",
  "title": "Aurora grid",
  "subtitle": "Animated grid wash for premium dashboards and heroes.",
  "chips": [
    "Ambient"
  ],
  "items": [
    "Grid lines",
    "Soft pulse"
  ],
  "accent": "Glow"
};

    export function PremiumMotionBackgroundGrid01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumMotionBackgroundGrid01;
