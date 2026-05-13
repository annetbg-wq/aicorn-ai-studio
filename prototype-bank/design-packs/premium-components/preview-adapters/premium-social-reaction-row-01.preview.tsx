/* @jsxRuntime classic */
import React from 'react';
import PremiumSocialReactionRow01 from '../social/premium-social-reaction-row-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-social-reaction-row-01',
  category: 'social',
  skeletons: ["social-community", "mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-social-reaction-row-01">
      <PremiumSocialReactionRow01 testId="component-premium-social-reaction-row-01" />
    </PremiumPreviewFrame>
  );
}
