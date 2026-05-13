/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-health-routine-card-01",
  "layout": "routineCard",
  "title": "Morning reset",
  "subtitle": "A gentle routine card for health-safe habit apps.",
  "chips": [
    "12 min"
  ],
  "items": [
    "Breathing",
    "Hydrate",
    "Stretch"
  ],
  "accent": "Today"
};

    export function PremiumHealthRoutineCard01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumHealthRoutineCard01;
