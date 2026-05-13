/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-landing-pricing-01",
  "layout": "pricing",
  "title": "Pricing without the spreadsheet headache",
  "subtitle": "Clear tiers for operators, founders, and growth teams.",
  "chips": [
    "Monthly",
    "Annual"
  ],
  "items": [
    "Starter",
    "Growth",
    "Scale"
  ],
  "accent": "Most popular"
};

    export function PremiumLandingPricing01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumLandingPricing01;
