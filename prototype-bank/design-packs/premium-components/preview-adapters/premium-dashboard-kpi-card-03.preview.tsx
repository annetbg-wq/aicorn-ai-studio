/* @jsxRuntime classic */
import React from 'react';
import PremiumDashboardKpiCard03 from '../dashboard/premium-dashboard-kpi-card-03/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-dashboard-kpi-card-03',
  category: 'dashboard',
  skeletons: ["saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-dashboard-kpi-card-03">
      <PremiumDashboardKpiCard03 testId="component-premium-dashboard-kpi-card-03" />
    </PremiumPreviewFrame>
  );
}
