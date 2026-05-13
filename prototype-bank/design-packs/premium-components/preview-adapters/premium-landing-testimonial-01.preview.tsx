/* @jsxRuntime classic */
import React from 'react';
import PremiumLandingTestimonial01 from '../landing/premium-landing-testimonial-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-landing-testimonial-01',
  category: 'landing',
  skeletons: ["landing-page"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-landing-testimonial-01">
      <PremiumLandingTestimonial01 testId="component-premium-landing-testimonial-01" />
    </PremiumPreviewFrame>
  );
}
