/* @jsxRuntime classic */
import React from 'react';
import PremiumDashboardMetricChart01 from '../dashboard/premium-dashboard-metric-chart-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-dashboard-metric-chart-01',
  category: 'dashboard',
  skeletons: ["saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-dashboard-metric-chart-01">
      <PremiumDashboardMetricChart01 testId="component-premium-dashboard-metric-chart-01" />
    </PremiumPreviewFrame>
  );
}
