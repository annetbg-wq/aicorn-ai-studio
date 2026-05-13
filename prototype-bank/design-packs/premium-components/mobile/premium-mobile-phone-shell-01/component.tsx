/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-mobile-phone-shell-01",
  "layout": "phoneShell",
  "title": "Phone preview shell",
  "subtitle": "Studio-safe mobile frame for premium previews.",
  "chips": [
    "iOS sized"
  ],
  "items": [
    "Status bar",
    "Rounded frame",
    "Content slot"
  ],
  "accent": "Preview"
};

    export function PremiumMobilePhoneShell01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumMobilePhoneShell01;
