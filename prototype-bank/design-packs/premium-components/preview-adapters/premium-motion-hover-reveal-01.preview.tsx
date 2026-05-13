/* @jsxRuntime classic */
import React from 'react';
import PremiumMotionHoverReveal01 from '../motion/premium-motion-hover-reveal-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-motion-hover-reveal-01',
  category: 'motion',
  skeletons: ["landing-page", "social-community"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-motion-hover-reveal-01">
      <PremiumMotionHoverReveal01 testId="component-premium-motion-hover-reveal-01" />
    </PremiumPreviewFrame>
  );
}
