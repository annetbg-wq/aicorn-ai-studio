/* @jsxRuntime classic */
import React from 'react';
import PremiumMotionBackgroundOrbital01 from '../motion/premium-motion-background-orbital-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-motion-background-orbital-01',
  category: 'motion',
  skeletons: ["landing-page", "mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-motion-background-orbital-01">
      <PremiumMotionBackgroundOrbital01 testId="component-premium-motion-background-orbital-01" />
    </PremiumPreviewFrame>
  );
}
