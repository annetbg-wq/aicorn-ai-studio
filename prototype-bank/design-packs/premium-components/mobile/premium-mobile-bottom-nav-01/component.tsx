/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-mobile-bottom-nav-01",
  "layout": "bottomNav",
  "title": "Bottom navigation",
  "subtitle": "Compact mobile destination rail.",
  "chips": [
    "Home",
    "Progress",
    "Profile"
  ],
  "items": [
    "Home",
    "Explore",
    "Progress",
    "Inbox",
    "Profile"
  ],
  "accent": "Home"
};

    export function PremiumMobileBottomNav01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumMobileBottomNav01;
