/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-social-reaction-row-01",
  "layout": "reactionRow",
  "title": "Reactions",
  "subtitle": "A clean action row for likes, saves, and replies.",
  "chips": [
    "Inline"
  ],
  "items": [
    "Like",
    "Comment",
    "Save",
    "Share"
  ],
  "accent": "128"
};

    export function PremiumSocialReactionRow01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumSocialReactionRow01;
