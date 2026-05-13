/* @jsxRuntime classic */
import React from 'react';
import PremiumHealthRoutineCard01 from '../health/premium-health-routine-card-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-health-routine-card-01',
  category: 'health',
  skeletons: ["mobile-app"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-health-routine-card-01">
      <PremiumHealthRoutineCard01 testId="component-premium-health-routine-card-01" />
    </PremiumPreviewFrame>
  );
}
