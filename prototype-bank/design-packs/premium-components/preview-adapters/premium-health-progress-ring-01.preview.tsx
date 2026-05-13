/* @jsxRuntime classic */
import React from 'react';
import PremiumHealthProgressRing01 from '../health/premium-health-progress-ring-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-health-progress-ring-01',
  category: 'health',
  skeletons: ["mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-health-progress-ring-01">
      <PremiumHealthProgressRing01 testId="component-premium-health-progress-ring-01" />
    </PremiumPreviewFrame>
  );
}
