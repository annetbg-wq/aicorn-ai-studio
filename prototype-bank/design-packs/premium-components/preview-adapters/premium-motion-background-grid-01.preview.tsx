/* @jsxRuntime classic */
import React from 'react';
import PremiumMotionBackgroundGrid01 from '../motion/premium-motion-background-grid-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-motion-background-grid-01',
  category: 'motion',
  skeletons: ["landing-page", "saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-motion-background-grid-01">
      <PremiumMotionBackgroundGrid01 testId="component-premium-motion-background-grid-01" />
    </PremiumPreviewFrame>
  );
}
