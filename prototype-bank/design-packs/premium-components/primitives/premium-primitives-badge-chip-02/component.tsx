/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-primitives-badge-chip-02",
  "layout": "badge",
  "title": "For product teams",
  "subtitle": "Segment chip for premium landing copy",
  "chips": [
    "Teams",
    "Ops"
  ],
  "items": [
    "Clear audience hint"
  ],
  "accent": "Teams"
};

    export function PremiumPrimitivesBadgeChip02(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumPrimitivesBadgeChip02;
