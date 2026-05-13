/* @jsxRuntime classic */
import React from 'react';
import PremiumMobileBottomNav01 from '../mobile/premium-mobile-bottom-nav-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-mobile-bottom-nav-01',
  category: 'mobile',
  skeletons: ["mobile-app", "social-community"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-mobile-bottom-nav-01">
      <PremiumMobileBottomNav01 testId="component-premium-mobile-bottom-nav-01" />
    </PremiumPreviewFrame>
  );
}
