/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-primitives-badge-chip-01",
  "layout": "badge",
  "title": "Stable release",
  "subtitle": "Compact label for status-rich UI",
  "chips": [
    "Verified",
    "Token-based"
  ],
  "items": [
    "Low risk",
    "Live now"
  ],
  "accent": "Stable"
};

    export function PremiumPrimitivesBadgeChip01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumPrimitivesBadgeChip01;
