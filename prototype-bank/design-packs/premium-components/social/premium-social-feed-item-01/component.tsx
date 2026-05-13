/* @jsxRuntime classic */
import React from 'react';
    import { PremiumPresetRenderer, type PremiumComponentProps, type PremiumPreset } from '../../_registry/premiumComponentPrimitives';

    const preset: PremiumPreset = {
  "id": "premium-social-feed-item-01",
  "layout": "feedItem",
  "title": "Creator update",
  "subtitle": "A polished social post shell with media-safe slot.",
  "chips": [
    "New post"
  ],
  "items": [
    "Preview image slot",
    "Caption area",
    "Meta row"
  ],
  "accent": "9m ago"
};

    export function PremiumSocialFeedItem01(props: PremiumComponentProps) {
      return <PremiumPresetRenderer preset={preset} {...props} />;
    }

    export default PremiumSocialFeedItem01;
