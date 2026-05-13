/* @jsxRuntime classic */
import React from 'react';
import PremiumHealthCalmInsight01 from '../health/premium-health-calm-insight-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-health-calm-insight-01',
  category: 'health',
  skeletons: ["mobile-app", "landing-page"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-health-calm-insight-01">
      <PremiumHealthCalmInsight01 testId="component-premium-health-calm-insight-01" />
    </PremiumPreviewFrame>
  );
}
