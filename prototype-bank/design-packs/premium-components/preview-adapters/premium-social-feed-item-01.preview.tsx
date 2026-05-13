/* @jsxRuntime classic */
import React from 'react';
import PremiumSocialFeedItem01 from '../social/premium-social-feed-item-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-social-feed-item-01',
  category: 'social',
  skeletons: ["social-community", "mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-social-feed-item-01">
      <PremiumSocialFeedItem01 testId="component-premium-social-feed-item-01" />
    </PremiumPreviewFrame>
  );
}
