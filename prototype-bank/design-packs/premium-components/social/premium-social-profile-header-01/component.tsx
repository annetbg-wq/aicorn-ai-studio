/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-social-profile-header-01",
  "layout": "profileHeader",
  "title": "Profile header",
  "subtitle": "Creator profile top section with badge stack.",
  "chips": [
    "42k followers"
  ],
  "items": [
    "Design systems",
    "Community building",
    "Weekly tutorials"
  ],
  "accent": "Follow"
};

    export function PremiumSocialProfileHeader01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumSocialProfileHeader01;
