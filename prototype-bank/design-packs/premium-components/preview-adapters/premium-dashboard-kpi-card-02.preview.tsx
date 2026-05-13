/* @jsxRuntime classic */
import React from 'react';
import PremiumDashboardKpiCard02 from '../dashboard/premium-dashboard-kpi-card-02/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-dashboard-kpi-card-02',
  category: 'dashboard',
  skeletons: ["saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-dashboard-kpi-card-02">
      <PremiumDashboardKpiCard02 testId="component-premium-dashboard-kpi-card-02" />
    </PremiumPreviewFrame>
  );
}
