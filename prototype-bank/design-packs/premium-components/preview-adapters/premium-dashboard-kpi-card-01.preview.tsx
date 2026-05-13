/* @jsxRuntime classic */
import React from 'react';
import PremiumDashboardKpiCard01 from '../dashboard/premium-dashboard-kpi-card-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-dashboard-kpi-card-01',
  category: 'dashboard',
  skeletons: ["saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-dashboard-kpi-card-01">
      <PremiumDashboardKpiCard01 testId="component-premium-dashboard-kpi-card-01" />
    </PremiumPreviewFrame>
  );
}
