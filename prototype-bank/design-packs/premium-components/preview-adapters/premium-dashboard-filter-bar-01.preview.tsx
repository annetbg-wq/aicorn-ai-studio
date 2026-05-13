/* @jsxRuntime classic */
import React from 'react';
import PremiumDashboardFilterBar01 from '../dashboard/premium-dashboard-filter-bar-01/component';
import { PremiumPreviewFrame } from './PremiumPreviewFrame';

export const previewMeta = {
  componentId: 'premium-dashboard-filter-bar-01',
  category: 'dashboard',
  skeletons: ["saas-dashboard"],
  renderSafe: true,
};

export function Preview() {
  return (
    <PremiumPreviewFrame testId="preview-premium-dashboard-filter-bar-01">
      <PremiumDashboardFilterBar01 testId="component-premium-dashboard-filter-bar-01" />
    </PremiumPreviewFrame>
  );
}
