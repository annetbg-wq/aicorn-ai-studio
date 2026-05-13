/* @jsxRuntime classic */
import React from 'react';
import PremiumDashboardTableList01 from '../dashboard/premium-dashboard-table-list-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-dashboard-table-list-01',
  category: 'dashboard',
  skeletons: ["saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-dashboard-table-list-01">
      <PremiumDashboardTableList01 testId="component-premium-dashboard-table-list-01" />
    </PremiumPreviewFrame>
  );
}
