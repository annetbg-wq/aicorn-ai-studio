/* @jsxRuntime classic */
import React from 'react';
import PremiumMotionProofMarquee01 from '../motion/premium-motion-proof-marquee-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-motion-proof-marquee-01',
  category: 'motion',
  skeletons: ["landing-page"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-motion-proof-marquee-01">
      <PremiumMotionProofMarquee01 testId="component-premium-motion-proof-marquee-01" />
    </PremiumPreviewFrame>
  );
}
