/* @jsxRuntime classic */
import React from 'react';
import PremiumSocialProfileHeader01 from '../social/premium-social-profile-header-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-social-profile-header-01',
  category: 'social',
  skeletons: ["social-community"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-social-profile-header-01">
      <PremiumSocialProfileHeader01 testId="component-premium-social-profile-header-01" />
    </PremiumPreviewFrame>
  );
}
