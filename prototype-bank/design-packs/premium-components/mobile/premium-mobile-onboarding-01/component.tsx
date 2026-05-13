/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-mobile-onboarding-01",
  "layout": "onboarding",
  "title": "Welcome to your guided setup",
  "subtitle": "Warm onboarding step with safe illustration slot.",
  "chips": [
    "Step 1 of 3"
  ],
  "items": [
    "Pick a goal",
    "Choose reminders",
    "See a preview"
  ],
  "accent": "Continue"
};

    export function PremiumMobileOnboarding01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumMobileOnboarding01;
