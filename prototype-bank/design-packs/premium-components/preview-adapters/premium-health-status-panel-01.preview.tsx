/* @jsxRuntime classic */
import React from 'react';
import PremiumHealthStatusPanel01 from '../health/premium-health-status-panel-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-health-status-panel-01',
  category: 'health',
  skeletons: ["mobile-app", "saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-health-status-panel-01">
      <PremiumHealthStatusPanel01 testId="component-premium-health-status-panel-01" />
    </PremiumPreviewFrame>
  );
}
