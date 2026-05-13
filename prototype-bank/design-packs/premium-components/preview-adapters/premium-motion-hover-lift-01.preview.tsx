/* @jsxRuntime classic */
import React from 'react';
import PremiumMotionHoverLift01 from '../motion/premium-motion-hover-lift-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-motion-hover-lift-01',
  category: 'motion',
  skeletons: ["landing-page", "saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-motion-hover-lift-01">
      <PremiumMotionHoverLift01 testId="component-premium-motion-hover-lift-01" />
    </PremiumPreviewFrame>
  );
}
