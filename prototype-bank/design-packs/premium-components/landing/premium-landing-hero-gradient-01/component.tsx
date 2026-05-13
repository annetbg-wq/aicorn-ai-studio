/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-landing-hero-gradient-01",
  "layout": "hero",
  "title": "Premium operating system for modern AI teams",
  "subtitle": "Ship faster with curated workflows, live previews, and a polished design baseline from day one.",
  "chips": [
    "Live render",
    "Studio-safe",
    "Local assets"
  ],
  "items": [
    "Operator dashboards",
    "Guided generation",
    "Token-aware components"
  ],
  "accent": "Launch studio"
};

    export function PremiumLandingHeroGradient01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumLandingHeroGradient01;
